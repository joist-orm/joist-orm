import DataLoader from "dataloader";
import hash from "object-hash";
import { isAlias } from "../Aliases";
import { Entity, isEntity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { opToFn } from "../EntityGraphQLFilter";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import {
  ColumnCondition,
  combineConditions,
  JoinTable,
  ParsedExpressionFilter,
  ParsedFindQuery,
  ParsedValueFilter,
  parseFindQuery,
} from "../QueryParser";
import { assertNever, cleanSql } from "../utils";

export function findDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
): DataLoader<FilterAndSettings<T>, unknown[]> {
  const { where, ...opts } = filter;

  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  // Clone b/c the complex conditions are not deep copies
  const clone = structuredClone(query);
  stripValues(clone);
  const batchKey = JSON.stringify(clone);

  return em.getLoader(
    "find",
    batchKey,
    async (queries) => {
      // We're guaranteed that these queries all have the same structure

      // Don't bother with the CTE if there's only 1 query (or each query has exactly the same filter values)
      if (queries.length === 1) {
        const rows = await em.driver.executeFind(em, query, opts);
        return [rows];
      }

      // WITH data(tag, arg1, arg2) AS (VALUES
      //   (1, 'a', 'a'),
      //   (2, 'b', 'b'),
      //   (3, 'c', 'c')
      // )
      // SELECT array_agg(d.tag), a.*
      // FROM authors a
      // JOIN data d ON (d.arg1 = a.first_name OR d.arg2 = a.last_name)
      // group by a.id;

      // Build the list of arg1, arg2, ... strings
      const args = collectArgs(query);

      // Mash together a SQL query ... maybe eventually we could massage the ParsedFindQuery
      // to support this by:
      // - pushing the `array_agg` onto the query.selects
      // - rewriting the value conditions to use the `em_find` CTE table
      // - adding a join onto the `em_find` table
      // Biggest wrinkle is that the join condition is non-trivial; currently the AST is only c1=c2
      const columns = ["array_agg(_find.tag) as _tags", ...query.selects];
      const primary = query.tables.find((t) => t.join === "primary")!;
      const innerJoins = query.tables.filter((t) => t.join === "inner") as JoinTable[];
      const outerJoins = query.tables.filter((t) => t.join === "outer") as JoinTable[];

      const bindings: any[] = [];
      queries.forEach((query) => {
        const { where, ...opts } = query;
        collectValues(bindings, parseFindQuery(meta, where, opts));
      });

      // Create the JOIN clause, i.e. ON a.firstName = _find.arg0
      const [conditions] = buildConditions(combineConditions(query));

      const sql = `
        WITH _find (tag, ${args.map((a) => a.name).join(", ")}) AS (VALUES
          ${queries
            .map((_, i) => {
              // Create each row of the CTE
              if (i === 0) {
                // use types for the first row
                return `(${[`${i}::int`, ...args.map((a) => `?::${a.dbType}`)].join(", ")})`;
              } else {
                // we don't need types for the rest of the rows
                return `(${[i, ...args.map(() => "?")].join(", ")})`;
              }
            })
            .join(", ")}
        )
        SELECT ${columns.join(", ")}
        FROM ${primary.table} as ${primary.alias}
        ${innerJoins.map((j) => `JOIN ${j.table} ${j.alias} ON ${j.col1} = ${j.col2}`).join(" ")}
        ${outerJoins.map((j) => `LEFT OUTER JOIN ${j.table} ${j.alias} ON ${j.col1} = ${j.col2}`).join(" ")}
        JOIN _find ON ${conditions}
        GROUP BY ${query.selects
          .filter((s) => !s.includes("CASE"))
          .filter((s) => !s.includes(" as "))
          .map((s) => s.replace("*", "id"))
          .join(", ")};
      `;

      const rows = await em.driver.executeQuery(em, cleanSql(sql), bindings);

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
    return v.id;
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
function collectArgs(query: ParsedFindQuery): { name: string; dbType: string }[] {
  const args: { name: string; dbType: string }[] = [];
  visit(query, {
    visitCond(c: ColumnCondition) {
      if ("value" in c.cond) {
        args.push({ name: `arg${args.length}`, dbType: c.dbType });
        // between has two values
        if (c.cond.kind === "between") {
          args.push({ name: `arg${args.length}`, dbType: c.dbType });
        }
      }
    },
  });
  return args;
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
function buildConditions(ef: ParsedExpressionFilter, argsIndex: number = 0): [string, number] {
  const conditions = [] as string[];
  ef.conditions.forEach((c) => {
    if ("cond" in c) {
      const [op, argsTaken] = makeOp(c.cond, argsIndex);
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
  return [conditions.join(` ${ef.op.toUpperCase()} `), argsIndex];
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
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${fn} _find.arg${argsIndex}`, 1];
    case "is-null":
      return [`IS NULL`, 0];
      break;
    case "not-null":
      return [`IS NOT NULL`, 0];
      break;
    case "in":
      return [`IN _find.arg${argsIndex}`, 1];
    case "nin":
      return [`NOT IN _find.arg${argsIndex}`, 1];
      break;
    case "@>":
      // FIX
      return [`NOT IN _find.arg${argsIndex}`, 1];
    case "between":
      // FIX
      const [min, max] = cond.value;
      return [`NOT IN _find.arg${argsIndex}`, 1];
    default:
      assertNever(cond);
  }
}
