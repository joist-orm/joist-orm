import DataLoader from "dataloader";
import hash from "object-hash";
import { isAlias } from "../Aliases";
import { Entity, isEntity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { opToFn } from "../EntityGraphQLFilter";
import { EntityManager, MaybeAbstractEntityConstructor, entityLimit } from "../EntityManager";
import { EntityMetadata, getMetadata } from "../EntityMetadata";
import {
  ColumnCondition,
  ParsedExpressionFilter,
  ParsedFindQuery,
  ParsedValueFilter,
  combineConditions,
  getTables,
  joinKeywords,
  parseFindQuery,
} from "../QueryParser";
import { assertNever, cleanSql } from "../utils";

export function findDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
): DataLoader<FilterAndSettings<T>, unknown[]> {
  const { where, ...opts } = filter;
  if (opts.limit || opts.offset) {
    throw new Error("Cannot use limit/offset with findDataLoader");
  }

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const batchKey = getBatchKeyFromGenericStructure(query);

  return em.getLoader(
    "find",
    batchKey,
    async (queries) => {
      // We're guaranteed that these queries all have the same structure

      // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
      if (queries.length === 1) {
        const { where, ...opts } = queries[0];
        // We have to parseFindQuery queries[0], b/c our query variable may be captured from
        // a prior invocation that instantiated our dataloader instance.
        const query = parseFindQuery(meta, where, opts);
        const rows = await em.driver.executeFind(em, query, {});
        ensureUnderLimit(rows);
        return [rows];
      }

      // WITH data(tag, arg1, arg2) AS (VALUES
      //   (0::int, 'a'::varchar, 'a'::varchar),
      //   (1, 'b', 'b'),
      //   (2, 'c', 'c')
      // )
      // SELECT array_agg(d.tag), a.*
      // FROM authors a
      // JOIN data d ON (d.arg1 = a.first_name OR d.arg2 = a.last_name)
      // group by a.id;

      // Build the list of 'arg1', 'arg2', ... strings
      const args = collectArgs(query);
      args.unshift({ columnName: "tag", dbType: "int" });

      const selects = ["array_agg(_find.tag) as _tags", ...query.selects];
      const [primary, joins] = getTables(query);

      // For each unique query, capture its filter values in `bindings` to populate the CTE _find table
      const bindings = createBindings(meta, queries);
      // Create the JOIN clause, i.e. ON a.firstName = _find.arg0
      const [conditions] = buildConditions(combineConditions(query));

      // Because we want to use `array_agg(tag)`, add `GROUP BY`s to the values we're selecting
      const groupBys = selects
        .filter((s) => !s.includes("array_agg") && !s.includes("CASE") && !s.includes(" as "))
        .map((s) => s.replace("*", "id"));

      // Also because of our `array_agg` group by, add any order bys to the group by
      for (const o of query.orderBys) {
        if (o.alias !== primary.alias) {
          groupBys.push(`${o.alias}.${o.column}`);
        }
      }

      const sql = `
        ${buildValuesCte("_find", args, queries)}
        SELECT ${selects.join(", ")}
        FROM ${primary.table} as ${primary.alias}
        ${joins.map((j) => `${joinKeywords(j)} ${j.table} ${j.alias} ON ${j.col1} = ${j.col2}`).join(" ")}
        JOIN _find ON ${conditions}
        GROUP BY ${groupBys.join(", ")}
        ORDER BY ${query.orderBys.map((o) => `${o.alias}.${o.column} ${o.order}`).join(", ")}
        LIMIT ${entityLimit};
      `;

      const rows = await em.driver.executeQuery(em, cleanSql(sql), bindings);
      ensureUnderLimit(rows);

      // Make an empty array for each batched query, per the dataloader contract
      const results = queries.map(() => [] as any[]);
      // Then put each row into the tagged query it matched
      for (const row of rows) {
        for (const tag of row._tags) {
          results[tag].push(row);
        }
        delete row._tags;
      }

      return results;
    },
    // Our filter/order tuple is a complex object, so object-hash it to ensure caching works
    { cacheKeyFn: whereFilterHash },
  );
}

// If a where clause includes an entity, object-hash cannot hash it, so just use the id.
function replacer(v: any) {
  if (isEntity(v)) {
    // Use toString() instead of id so that new entities are kept separate, i.e. `Author#2`
    return v.toString();
  }
  // Strip out `{ as: ...alias proxy... }` from the `em.find` inline conditions
  if (isAlias(v)) {
    return "alias";
  }
  return v;
}

export function whereFilterHash(where: FilterAndSettings<any>): any {
  return hash(where, { replacer, algorithm: "md5" });
}

/** Collects & names all the args in a query, i.e. `['arg1', 'arg2']`--not the actual values. */
export function collectArgs(query: ParsedFindQuery): { columnName: string; dbType: string }[] {
  const args: { columnName: string; dbType: string }[] = [];
  visit(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        const { kind } = c.cond;
        if (kind === "in" || kind === "nin") {
          args.push({ columnName: `arg${args.length}`, dbType: `${c.dbType}[]` });
        } else if (kind === "between") {
          // between has two values
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
        } else {
          args.push({ columnName: `arg${args.length}`, dbType: c.dbType });
        }
      }
    },
  });
  return args;
}

export function createBindings(meta: EntityMetadata<any>, queries: readonly FilterAndSettings<any>[]): any[] {
  const bindings: any[] = [];
  queries.forEach((query, i) => {
    const { where, ...opts } = query;
    // add this query's `tag` value
    bindings.push(i);
    collectValues(bindings, parseFindQuery(meta, where, opts));
  });
  return bindings;
}

/** Pushes the arg values of a given query in the cross-query `bindings` array. */
function collectValues(bindings: any[], query: ParsedFindQuery): void {
  visit(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        // between has two values
        if (c.cond.kind === "between") {
          bindings.push(c.cond.value[0]);
          bindings.push(c.cond.value[1]);
        } else {
          bindings.push(c.cond.value);
        }
      }
    },
  });
}

/** Replaces all values with `*` so we can see the generic structure of the query. */
function stripValues(query: ParsedFindQuery): void {
  visit(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        c.cond.value = "*";
      }
    },
  });
}

/** A generic visitor over the simple & complex conditions of a query. */
interface Visitor {
  visitExpFilter?(c: ParsedExpressionFilter): void;
  visitCond(c: ColumnCondition): void;
}
function visit(query: ParsedFindQuery, visitor: Visitor): void {
  const { visitCond } = visitor;
  function visitExpFilter(ef: ParsedExpressionFilter) {
    ef.conditions.forEach((c) => {
      if ("cond" in c) {
        visitCond(c);
      } else {
        visitExpFilter(c);
      }
    });
  }
  query.conditions.forEach(visitCond);
  query.complexConditions?.forEach(visitExpFilter);
}

// Create the a1.firstName=data.firstName AND a2.lastName=data.lastName
export function buildConditions(ef: ParsedExpressionFilter, argsIndex: number = 0): [string, number] {
  const conditions = [] as string[];
  const originalIndex = argsIndex;
  ef.conditions.forEach((c) => {
    if ("cond" in c) {
      const [op, argsTaken] = makeOp(c.cond, argsIndex);
      if (c.alias === "unset") {
        throw new Error("Alias was not bound in em.find");
      }
      conditions.push(`${c.alias}.${c.column} ${op}`);
      argsIndex += argsTaken;
    } else {
      let [cond, argsTaken] = buildConditions(c, argsIndex);
      const needsWrap = !("cond" in c);
      if (needsWrap) cond = `(${cond})`;
      conditions.push(cond);
      argsIndex += argsTaken;
    }
  });
  const argsTaken = argsIndex - originalIndex;
  return [conditions.join(` ${ef.op.toUpperCase()} `), argsTaken];
}

function makeOp(cond: ParsedValueFilter<any>, argsIndex: number): [string, number] {
  switch (cond.kind) {
    case "eq":
    case "ne":
    case "gte":
    case "gt":
    case "lte":
    case "lt":
    case "like":
    case "ilike":
    case "contains":
    case "overlaps":
    case "containedBy":
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${fn} _find.arg${argsIndex}`, 1];
    case "is-null":
      return [`IS NULL`, 0];
    case "not-null":
      return [`IS NOT NULL`, 0];
    case "in":
      return [`= ANY(_find.arg${argsIndex})`, 1];
    case "nin":
      return [`!= ALL(_find.arg${argsIndex})`, 1];
    case "between":
      return [`BETWEEN _find.arg${argsIndex} AND _find.arg${argsIndex + 1}`, 2];
    default:
      assertNever(cond);
  }
}

export function buildValuesCte(
  tableName: string,
  columns: { columnName: string; dbType: string }[],
  rows: readonly any[],
): string {
  return `WITH ${tableName} (${columns.map((c) => `"${c.columnName}"`).join(", ")}) AS (VALUES
      ${rows.map((_, i) => `(${columns.map((c) => (i === 0 ? `?::${c.dbType}` : `?`)).join(", ")})`).join(", ")}
  )`;
}

function ensureUnderLimit(rows: unknown[]): void {
  if (rows.length >= entityLimit) {
    throw new Error(`Query returned more than ${entityLimit} rows`);
  }
}

export function getBatchKeyFromGenericStructure(query: ParsedFindQuery): string {
  // Clone b/c parseFindQuery does not deep copy complex conditions, i.e. `a.firstName.eq(...)`
  const clone = structuredClone(query);
  stripValues(clone);
  // We could use `whereFilterHash` too if it's faster?
  return JSON.stringify(clone);
}
