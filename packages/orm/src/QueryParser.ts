import { groupBy, isPlainObject } from "joist-utils";
import { aliasMgmt, isAlias, newAliasProxy } from "./Aliases";
import { Entity, isEntity } from "./Entity";
import { ExpressionFilter, OrderBy, ValueFilter } from "./EntityFilter";
import { EntityMetadata, getBaseMeta } from "./EntityMetadata";
import { abbreviation } from "./QueryBuilder";
import { visitConditions } from "./QueryVisitor";
import { getMetadataForTable } from "./configure";
import { buildCondition } from "./drivers/buildUtils";
import { Column, getConstructorFromTaggedId, isDefined, keyToNumber, maybeResolveReferenceToId } from "./index";
import { kq, kqDot } from "./keywords";
import { assertNever, fail, partition } from "./utils";

/** A tree of ANDs/ORs with conditions or nested conditions. */
export interface ParsedExpressionFilter {
  kind: "exp";
  op: "and" | "or";
  conditions: ParsedExpressionCondition[];
}

/** A condition or nested condition in a `ParsedExpressionFilter`. */
export type ParsedExpressionCondition = ParsedExpressionFilter | ColumnCondition | RawCondition;

export interface ColumnCondition {
  kind: "column";
  alias: string;
  column: string;
  dbType: string;
  cond: ParsedValueFilter<any>;
  /**
   * A pruneable condition is one that was auto-added by something like soft-delete, and shouldn't
   * be something that marks a join as actually used by the user's query.
   */
  pruneable?: boolean;
}

/** A user-provided condition like `SUM(${alias}.amount) > 1000` or `a1.last_name = b1.title`. */
export interface RawCondition {
  kind: "raw";
  /** The aliases, i.e. `[a, b]`, used within the condition, to ensure we don't prune them. */
  aliases: string[];
  /** The condition itself, i.e. `SUM(a.age) DESC`. */
  condition: string;
  /** The bindings within `condition`, i.e. `SUM(${alias}.amount) > ?`. */
  bindings: any[];
  /** Used to mark system-added conditions (like `LATERAL JOIN` conditions), which can be ignored when pruning unused joins. */
  pruneable: boolean;
}

/** A marker condition for alias methods to indicate they should be skipped/pruned. */
export const skipCondition: ColumnCondition = {
  kind: "column",
  alias: "skip",
  column: "skip",
  dbType: "skip",
  cond: undefined as any,
};

export interface PrimaryTable {
  join: "primary";
  alias: string;
  table: string;
}

/**
 * Joins into 0-1 relations, i.e. children up to a parent.
 *
 * Even though `LateralJoinTable` handles the "many children" case, we keep the
 * `"outer"` join for doing joins to optional "0 or 1" relations, where we don't
 * want a missing result to mean the primary entity itself is not returned.
 */
export interface JoinTable {
  join: "inner" | "outer";
  alias: string;
  table: string;
  col1: string;
  col2: string;
}

export type ParsedTable = PrimaryTable | JoinTable | LateralJoinTable;

/** Joins into 0-N relations, i.e. parent down to many children. */
export interface LateralJoinTable {
  join: "lateral";
  alias: string;
  fromAlias: string;
  table: string;
  query: ParsedFindQuery;
}

export interface ParsedOrderBy {
  alias: string;
  column: string;
  order: OrderBy;
}

/** The result of parsing an `em.find` filter. */
export interface ParsedFindQuery {
  selects: (string | { sql: string; bindings: any[] })[];
  /** The primary table plus any joins. */
  tables: ParsedTable[];
  /** Any cross lateral joins, where the `joins: string[]` has the full join as raw SQL; currently only for preloading. */
  lateralJoins?: {
    // I.e. `cross join lateral join (select ... from ...) as _b`
    joins: string[];
    bindings: any[];
  };
  /** The query's conditions. */
  condition?: ParsedExpressionFilter;
  /** Any optional orders to add before the default 'order by id'. */
  orderBys: ParsedOrderBy[];
  /** Optional CTE to prefix to the query, i.e. for recursive relations. */
  cte?: { sql: string; bindings: readonly any[] };
}

/** Parses an `em.find` filter into a `ParsedFindQuery` for simpler execution. */
export function parseFindQuery(
  meta: EntityMetadata,
  filter: any,
  opts: {
    conditions?: ExpressionFilter;
    orderBy?: any;
    pruneJoins?: boolean;
    keepAliases?: string[];
    softDeletes?: "include" | "exclude";
    // Allow recursively calling ourselves for putting together lateral joins
    aliases?: Record<string, number>;
    alias?: string;
  } = {},
): ParsedFindQuery {
  const selects: string[] = [];
  const tables: ParsedTable[] = [];
  const orderBys: ParsedOrderBy[] = [];
  const query = { selects, tables, orderBys };
  const {
    orderBy = undefined,
    conditions: optsExpression = undefined,
    softDeletes = "exclude",
    pruneJoins = true,
    keepAliases = [],
  } = opts;

  const cb = new ConditionBuilder();

  const aliases: Record<string, number> = opts.aliases ?? {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  // If they passed extra `conditions: ...`, parse that.
  // We can do this up-front b/c it doesn't require any join-tree metadata to perform,
  // and then it's available for our `addLateralJoin`s to rewrite.
  if (optsExpression) cb.maybeAddExpression(optsExpression);

  // ...how do we pull up data to use in any conditions?...
  // what would the format look like? probably just nested JSON...
  function addLateralJoin(
    meta: EntityMetadata,
    fromAlias: string,
    alias: string,
    col1: string,
    col2: string,
    filter: any,
  ) {
    const ef = parseEntityFilter(meta, filter);
    // Maybe skip
    if (!ef && !isAlias(filter)) return;

    bindAlias(filter, meta, alias);

    // Create an alias to use for our subquery's `where parent_id = id` condition
    const a = newAliasProxy(meta.cstr);

    const subFilter =
      // subFilter will be unprocessed, so we can pass it recursively into `parseFindQuery`
      ef && ef.kind === "join"
        ? ef.subFilter
        : // If `ef` is set, it's already parsed, which `parseFindQuery` won't expect, so pass the original `filter`
          ef !== undefined
          ? { id: filter }
          : {};
    const count = "$count" in subFilter ? subFilter["$count"] : undefined;
    const subQuery = parseFindQuery(
      meta,
      { as: a, ...subFilter },
      {
        conditions: {
          and: [
            { kind: "raw", aliases: [fromAlias, alias], condition: `${col1} = ${col2}`, pruneable: true, bindings: [] },
          ],
        },
        aliases,
        alias,
      },
    );
    subQuery.selects = ["count(*) as _"];
    subQuery.orderBys = [];
    tables.push({ join: "lateral", table: meta.tableName, query: subQuery, alias, fromAlias });

    // Look for complex conditions...
    const complexConditions = cb.findAndRewrite(alias);
    for (const cc of complexConditions) {
      const [sql, bindings] = buildCondition(cc.cond);
      subQuery.selects.push({ sql: `BOOL_OR(${sql}) as ${cc.as}`, bindings });
    }

    // If there are complex conditions looking at our data, we don't need an extra check
    if (complexConditions.length === 0) {
      cb.addSimpleCondition({
        kind: "column",
        alias,
        column: "_",
        dbType: "int",
        cond: count !== undefined ? { kind: "eq", value: count } : { kind: "gt", value: 0 },
        // Don't let this condition pin the join, unless the user asked for a specific count
        // (or deepFindConditions finds a real condition from the above filter).
        pruneable: count === undefined,
      });
    }
  }

  /** Adds `meta` to the query, i.e. for m2o/o2o joins into parents. */
  function addTable(
    meta: EntityMetadata,
    alias: string,
    join: ParsedTable["join"],
    col1: string,
    col2: string,
    filter: any,
  ): void {
    // look at filter, is it `{ book: "b2" }` or `{ book: { ... } }`
    const ef = parseEntityFilter(meta, filter);
    // Maybe skip
    if (!ef && join !== "primary" && !isAlias(filter)) return;

    if (join === "primary") {
      tables.push({ alias, table: meta.tableName, join });
    } else if (join === "lateral") {
      fail("Unexpected lateral join");
    } else {
      tables.push({ alias, table: meta.tableName, join, col1, col2 });
    }

    // Maybe only do this if we're the primary, or have a field that needs it?
    addTablePerClassJoinsAndClassTag(query, meta, alias, join === "primary");
    if (needsStiDiscriminator(meta)) {
      addStiSubtypeFilter(cb, meta, alias);
    }

    maybeAddNotSoftDeleted(cb, softDeletes, meta, alias);
    bindAlias(filter, meta, alias);

    // See if the clause says we must do a join into the relation
    if (ef && ef.kind === "join") {
      // subFilter really means we're matching against the entity columns/further joins
      Object.keys(ef.subFilter).forEach((key) => {
        // Skip the `{ as: ... }` alias binding
        if (key === "as" || key === "$count") return;
        const field =
          meta.allFields[key] ??
          meta.polyComponentFields?.[key] ??
          fail(`Field '${key}' not found on ${meta.tableName}`);
        const fa = `${alias}${field.aliasSuffix}`;
        if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
          const column = field.serde.columns[0];
          parseValueFilter((ef.subFilter as any)[key]).forEach((filter) => {
            cb.addValueFilter(fa, column, filter);
          });
        } else if (field.kind === "m2o") {
          const column = field.serde.columns[0];
          const sub = (ef.subFilter as any)[key];
          const joinKind = field.required && join !== "outer" ? "inner" : "outer";
          if (isAlias(sub)) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(field.otherMetadata(), a, joinKind, kqDot(fa, column.columnName), kqDot(a, "id"), sub);
          }
          const f = parseEntityFilter(field.otherMetadata(), sub);
          // Probe the filter and see if it's just an id (...and not soft deleted), if so we can avoid the join
          if (!f) {
            // skip
          } else if (f.kind === "join" || filterSoftDeletes(field.otherMetadata(), softDeletes)) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(field.otherMetadata(), a, joinKind, kqDot(fa, column.columnName), kqDot(a, "id"), sub);
          } else {
            cb.addValueFilter(fa, column, f);
          }
        } else if (field.kind === "poly") {
          const f = parseEntityFilter(meta, (ef.subFilter as any)[key]);
          if (!f) {
            // skip
          } else if (f.kind === "join") {
            throw new Error("Joins through polys are not supported");
          } else {
            // We're left with basically a ValueFilter against the ids
            // For now only support eq/ne/in/is-null
            if (f.kind === "eq" || f.kind === "ne") {
              if (isNilIdValue(f.value)) return;
              const comp =
                field.components.find(
                  (p) => p.otherMetadata().cstr === getConstructorFromTaggedId(f.value as string),
                ) || fail(`Could not find component for ${f.value}`);
              const column = field.serde.columns.find((c) => c.columnName === comp.columnName)!;
              cb.addValueFilter(fa, column, f);
            } else if (f.kind === "is-null") {
              // Add a condition for every component--these can be AND-d with the rest of the simple/inline conditions
              field.components.forEach((comp) => {
                const column = field.serde.columns.find((c) => c.columnName === comp.columnName)!;
                cb.addSimpleCondition({
                  kind: "column",
                  alias: fa,
                  column: comp.columnName,
                  dbType: column.dbType,
                  cond: f,
                });
              });
            } else if (f.kind === "not-null") {
              const conditions = field.components.map((comp) => {
                const column = field.serde.columns.find((c) => c.columnName === comp.columnName)!;
                return {
                  kind: "column",
                  alias: fa,
                  column: comp.columnName,
                  dbType: column.dbType,
                  cond: { kind: "not-null" },
                };
              }) satisfies ColumnCondition[];
              cb.addParsedExpression({ kind: "exp", op: "or", conditions });
            } else if (f.kind === "in") {
              // Split up the ids by constructor
              const idsByConstructor = groupBy(f.value, (id) => getConstructorFromTaggedId(id as string).name);
              // Or together `parent_book_id in (1,2,3) OR parent_author_id IN (4,5,6)`
              // ...if there is a `parent IN [b:1, b:2, a:1, null]` we'd need to pull the `null` out and do an `OR (all columns are null)`...
              const conditions = Object.entries(idsByConstructor).map(([cstrName, ids]) => {
                const column = field.serde.columns.find((c) => c.otherMetadata().cstr.name === cstrName)!;
                return {
                  kind: "column",
                  alias: fa,
                  column: column.columnName,
                  dbType: column.dbType,
                  cond: mapToDb(column, { kind: "in", value: ids }),
                } satisfies ColumnCondition;
              });
              if (conditions.length > 0) {
                cb.addParsedExpression({ kind: "exp", op: "or", conditions });
              }
            } else {
              throw new Error(`Filters on polys for ${f.kind} are not supported`);
            }
          }
        } else if (field.kind === "o2o") {
          // We have to always join into o2os, i.e. we can't probe the filter like we do for m2os
          const a = getAlias(field.otherMetadata().tableName);
          const otherColumn = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
          addTable(
            field.otherMetadata(),
            a,
            "outer",
            kqDot(alias, "id"),
            kqDot(a, otherColumn),
            (ef.subFilter as any)[key],
          );
        } else if (field.kind === "o2m") {
          // ...don't outer join, instead do a lateral join...
          // old code
          // const a = getAlias(field.otherMetadata().tableName);
          // const otherField = field.otherMetadata().allFields[field.otherFieldName];
          // let otherColumn = otherField.serde!.columns[0].columnName;
          // // If the other field is a poly, we need to find the right column
          // if (otherField.kind === "poly") {
          //   // For a subcomponent that matches field's metadata
          //   const otherComponent =
          //     otherField.components.find((c) => c.otherMetadata() === meta) ??
          //     fail(`No poly component found for ${otherField.fieldName}`);
          //   otherColumn = otherComponent.columnName;
          // }
          // addTable(
          //   field.otherMetadata(),
          //   a,
          //   "outer",
          //   kqDot(alias, "id"),
          //   kqDot(a, otherColumn),
          //   (ef.subFilter as any)[key],
          // );

          const a = getAlias(field.otherMetadata().tableName);
          const otherField = field.otherMetadata().allFields[field.otherFieldName];
          let otherColumn = otherField.serde!.columns[0].columnName;
          addLateralJoin(
            field.otherMetadata(),
            alias,
            a,
            kqDot(alias, "id"),
            kqDot(a, otherColumn),
            (ef.subFilter as any)[key],
          );
        } else if (field.kind === "m2m") {
          // Always join into the m2m table
          const ja = getAlias(field.joinTableName);
          tables.push({
            alias: ja,
            join: "outer",
            table: field.joinTableName,
            col1: kqDot(alias, "id"),
            col2: kqDot(ja, field.columnNames[0]),
          });
          // But conditionally join into the alias table
          const sub = (ef.subFilter as any)[key];
          if (isAlias(sub)) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(field.otherMetadata(), a, "outer", kqDot(ja, field.columnNames[1]), kqDot(a, "id"), sub);
          }
          const f = parseEntityFilter(field.otherMetadata(), sub);
          // Probe the filter and see if it's just an id, if so we can avoid the join
          if (!f) {
            // skip
          } else if (f.kind === "join" || filterSoftDeletes(field.otherMetadata(), softDeletes)) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(
              field.otherMetadata(),
              a,
              "outer",
              kqDot(ja, field.columnNames[1]),
              kqDot(a, "id"),
              (ef.subFilter as any)[key],
            );
          } else {
            const meta = field.otherMetadata();
            // We normally don't have `columns` for m2m fields, b/c they don't go through normal serde
            // codepaths, so make one up to leverage the existing `mapToDb` function.
            const column: any = {
              columnName: field.columnNames[1],
              dbType: meta.idDbType,
              mapToDb(value: any) {
                // Check for `typeof value === number` in case this is a new entity, and we've been given the nilIdValue
                return value === null || isNilIdValue(value)
                  ? value
                  : keyToNumber(meta, maybeResolveReferenceToId(value));
              },
            };
            cb.addSimpleCondition({
              kind: "column",
              alias: ja,
              column: field.columnNames[1],
              dbType: meta.idDbType,
              cond: mapToDb(column, f),
            });
          }
        } else {
          throw new Error(`Unsupported field ${key}`);
        }
      });
    } else if (ef) {
      const column = meta.fields["id"].serde!.columns[0];
      cb.addValueFilter(alias, column, ef);
    }
  }

  function addOrderBy(meta: EntityMetadata, alias: string, orderBy: Record<string, any>): void {
    const entries = Object.entries(orderBy);
    if (entries.length === 0) return;
    for (const [key, value] of entries) {
      if (!value) continue; // prune undefined
      const field = meta.allFields[key] ?? fail(`${key} not found on ${meta.tableName}`);
      if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
        const column = field.serde.columns[0];
        orderBys.push({
          alias: `${alias}${field.aliasSuffix ?? ""}`,
          column: column.columnName,
          order: value as OrderBy,
        });
      } else if (field.kind === "m2o") {
        // Do we already this table joined in?
        let table = tables.find((t) => t.table === field.otherMetadata().tableName);
        if (table) {
          addOrderBy(field.otherMetadata(), table.alias, value);
        } else {
          const table = field.otherMetadata().tableName;
          const a = getAlias(table);
          const column = field.serde.columns[0].columnName;
          // If we don't have a join, don't force this to be an inner join
          tables.push({
            alias: a,
            table,
            join: "outer", // don't drop the entity just b/c of a missing order by
            col1: kqDot(alias, column),
            col2: kqDot(a, "id"),
          });
          addOrderBy(field.otherMetadata(), a, value);
        }
      } else {
        throw new Error(`Unsupported field ${key}`);
      }
    }
  }

  // always add the main table
  const alias = opts.alias ?? getAlias(meta.tableName);
  selects.push(`${kq(alias)}.*`);
  addTable(meta, alias, "primary", "n/a", "n/a", filter);

  Object.assign(query, {
    condition: cb.toExpressionFilter(),
  });

  if (query.tables.some((t) => t.join === "outer")) {
    maybeAddIdNotNulls(query);
  }

  if (orderBy) {
    if (Array.isArray(orderBy)) {
      for (const ob of orderBy) addOrderBy(meta, alias, ob);
    } else {
      addOrderBy(meta, alias, orderBy);
    }
  }
  maybeAddOrderBy(query, meta, alias);

  if (pruneJoins) {
    pruneUnusedJoins(query, keepAliases);
  }

  return query;
}

/**
 * Look for conditions doing `some_column IS NULL` in an outer join that
 * need an `id IS NOT NULL` to make sure they don't match inadvertently on
 * the child row simply not existing.
 *
 * Note: Instead of injecting an extra `id IS NOT NULL` condition, I had tried
 * using all INNER JOINs and flipping joins to OUTER only if the user explicit
 * had `id IS NULL` in their filter, but that didn't work for queries that wanted
 * to do an `OR` across two different children (which queries both children being
 * OUTER JOINs, and detecting that case seemed complicated).
 */
function maybeAddIdNotNulls(query: ParsedFindQuery): void {
  visitConditions(query, {
    visitCond(c: ColumnCondition) {
      // Check `c.prunable` to make sure we don't catch our injected `deleted_at is null` conditions
      if (c.cond.kind !== "is-null" || c.column === "id" || c.pruneable) {
        return c;
      }
      // This is an `some_column IS NULL`, is it in an outer join?
      const table = query.tables.find((t) => t.alias === c.alias);
      if (table && table.join === "outer") {
        const meta = getMetadataForTable(table.table);
        return {
          kind: "exp",
          op: "and",
          conditions: [
            c,
            {
              kind: "column",
              alias: c.alias,
              column: "id",
              dbType: meta.idDbType,
              cond: { kind: "not-null" },
            },
          ],
        } satisfies ParsedExpressionFilter;
      }
      return c;
    },
  });
}

// Remove any joins that are not used in the select or conditions
function pruneUnusedJoins(parsed: ParsedFindQuery, keepAliases: string[]): void {
  // Mark all terminal usages
  const used = new Set<string>();
  parsed.selects.forEach((s) => {
    if (typeof s === "string") used.add(parseAlias(s));
  });
  parsed.orderBys.forEach((o) => used.add(o.alias));
  keepAliases.forEach((a) => used.add(a));
  deepFindConditions(parsed.condition)
    .filter((c) => !c.pruneable)
    .forEach((c) => {
      switch (c.kind) {
        case "column":
          used.add(c.alias);
          break;
        case "raw":
          for (const alias of c.aliases) {
            used.add(alias);
          }
          break;
        default:
          assertNever(c);
      }
    });
  // Mark all usages via joins
  for (let i = 0; i < parsed.tables.length; i++) {
    const t = parsed.tables[i];
    if (t.join === "lateral") {
      // Recurse into the join...
      // pruneUnusedJoins(t.query, keepAliases);
      // how can I tell if this join is used?
      const hasRealCondition = deepFindConditions(t.query.condition).some((c) => !c.pruneable);
      if (hasRealCondition) used.add(t.alias);
      const a1 = t.fromAlias;
      const a2 = t.alias;
      // the a.count is getting seen
      if (used.has(a2) && !used.has(a1)) {
        used.add(a1);
        // Restart at zero to find dependencies before us
        i = 0;
      }
    } else if (t.join !== "primary") {
      // If alias (col2) is required, ensure the col1 alias is also required
      const a2 = t.alias;
      const a1 = parseAlias(t.col1);
      if (used.has(a2) && !used.has(a1)) {
        used.add(a1);
        // Restart at zero to find dependencies before us
        i = 0;
      }
    }
  }
  // Now remove any unused joins
  parsed.tables = parsed.tables.filter((t) => used.has(t.alias));
  // And then remove any inline soft-delete conditions we don't need anymore
  if (parsed.condition && parsed.condition.op === "and") {
    parsed.condition.conditions = parsed.condition.conditions.filter((c) => {
      if (c.kind === "column") {
        const prune = c.pruneable && !parsed.tables.some((t) => t.alias === c.alias);
        return !prune;
      } else {
        return c;
      }
    });
  }
}

/** Pulls out a flat list of all `ColumnCondition`s from a `ParsedExpressionFilter` tree. */
function deepFindConditions(condition: ParsedExpressionFilter | undefined): (ColumnCondition | RawCondition)[] {
  const todo = condition ? [condition] : [];
  const result: (ColumnCondition | RawCondition)[] = [];
  while (todo.length !== 0) {
    const cc = todo.pop()!;
    for (const c of cc.conditions) {
      if (c.kind === "exp") {
        todo.push(c);
      } else {
        result.push(c);
      }
    }
  }
  return result;
}

/** Returns the `a` from `"a".*`. */
function parseAlias(alias: string): string {
  return alias.split(".")[0].replaceAll(`"`, "");
}

/** An ADT version of `EntityFilter`. */
export type ParsedEntityFilter =
  // ParsedValueFilter is any simple match on `id`
  | ParsedValueFilter<string | number>
  // Otherwise we return the join/complex
  | { kind: "join"; subFilter: object };

/** Parses an entity filter, which could be "just an id", an array of ids, or a nested filter. */
export function parseEntityFilter(meta: EntityMetadata, filter: any): ParsedEntityFilter | undefined {
  if (filter === undefined) {
    // This matches legacy `em.find(Book, { author: undefined })` behavior
    return undefined;
  } else if (isAlias(filter)) {
    // We're just binding an alias to this position in the join tree
    return undefined;
  } else if (filter === null) {
    return { kind: "is-null" };
  } else if (typeof filter === "string" || typeof filter === "number") {
    return { kind: "eq", value: filter };
  } else if (typeof filter === "boolean") {
    return filter ? { kind: "not-null" } : { kind: "is-null" };
  } else if (Array.isArray(filter)) {
    return {
      kind: "in",
      value: filter.map((v: string | number | Entity) => {
        return isEntity(v) ? (v.idTaggedMaybe ?? nilIdValue(meta)) : v;
      }),
    };
  } else if (isEntity(filter)) {
    return { kind: "eq", value: filter.idTaggedMaybe || nilIdValue(meta) };
  } else if (typeof filter === "object") {
    // Looking for `{ firstName: "f1" }` or `{ ne: "f1" }`
    const keys = Object.keys(filter);
    // Special case only looking at `ne`
    if (keys.length === 1 && keys[0] === "ne") {
      const value = filter["ne"];
      if (value === undefined) {
        return undefined;
      } else if (value === null) {
        return { kind: "not-null" };
      } else if (typeof value === "string" || typeof value === "number") {
        return { kind: "ne", value };
      } else if (isEntity(value)) {
        return { kind: "ne", value: value.idTaggedMaybe || nilIdValue(meta) };
      } else {
        throw new Error(`Unsupported "ne" value ${value}`);
      }
    }
    // Special case only looking at `id`
    if (keys.length === 1 && keys[0] === "id") {
      const value = filter["id"];
      if (value === undefined) {
        return undefined;
      } else if (value === null) {
        return { kind: "is-null" };
      } else if (typeof value === "string" || typeof value === "number") {
        return { kind: "eq", value };
      } else if (isEntity(value)) {
        return { kind: "eq", value: value.idTaggedMaybe || nilIdValue(meta) };
      } else {
        return parseValueFilter(value)[0] as any;
      }
    }
    // Look for subFilter values being EntityFilter-ish instances like ManyToOneReference
    // that have an id, and so structurally match the entity filter without really being filters,
    // and convert them over here before getting into parseValueFilter.
    const subFilter = {} as any;
    for (const [key, value] of Object.entries(filter)) {
      if (value && typeof value === "object" && !isPlainObject(value) && "idTaggedMaybe" in value) {
        subFilter[key] = value.idTaggedMaybe || nilIdValue(meta);
      } else {
        subFilter[key] = value;
      }
    }
    return { kind: "join", subFilter };
  } else {
    throw new Error(`Unrecognized filter ${filter}`);
  }
}

/**
 * We use this value if users include new (id-less) entities as em.find conditions.
 *
 * The idea is that this condition would never be met, but we still want to do the em.find
 * query in case it's in an `OR` clause that would match false, but some other part of the
 * clause would match. I.e. instead of just skipping the DB query all together, which is
 * also something we could consider doing.
 *
 * For int IDs we use -1, and for uuid IDs, we use the nil UUID value:
 *
 * https://en.wikipedia.org/wiki/Universally_unique_identifier#Nil_UUID
 */
function nilIdValue(meta: EntityMetadata): any {
  switch (meta.idDbType) {
    case "int":
    case "bigint":
      return -1;
    case "uuid":
      return "00000000-0000-0000-0000-000000000000";
    case "text":
      return "0";
    default:
      return assertNever(meta.idDbType);
  }
}

function isNilIdValue(value: any): boolean {
  return value === -1 || value === "00000000-0000-0000-0000-000000000000";
}

/**
 * An ADT version of `ValueFilter`.
 *
 * The ValueFilter is a
 */
export type ParsedValueFilter<V> =
  | { kind: "eq"; value: V }
  | { kind: "in"; value: readonly V[] }
  | { kind: "nin"; value: readonly V[] }
  | { kind: "gt"; value: V }
  | { kind: "gte"; value: V }
  | { kind: "ne"; value: V }
  | { kind: "is-null" }
  | { kind: "not-null" }
  | { kind: "lt"; value: V }
  | { kind: "lte"; value: V }
  | { kind: "like"; value: V }
  | { kind: "nlike"; value: V }
  | { kind: "ilike"; value: V }
  | { kind: "nilike"; value: V }
  | { kind: "regex"; value: V }
  | { kind: "nregex"; value: V }
  | { kind: "iregex"; value: V }
  | { kind: "niregex"; value: V }
  | { kind: "contains"; value: readonly V[] }
  | { kind: "ncontains"; value: readonly V[] }
  | { kind: "overlaps"; value: readonly V[] }
  | { kind: "noverlaps"; value: readonly V[] }
  | { kind: "containedBy"; value: readonly V[] }
  | { kind: "between"; value: [V, V] };

/**
 * Parses the many/hodgepodge (ergonomic!) patterns of value filters into a `ParsedValueFilter[]`.
 *
 * Note we return an array because filter might be a `ValueGraphQLFilter` that is allowed to have
 * multiple conditions, i.e. `{ lt: 10, gt: 5 }`.
 */
export function parseValueFilter<V>(filter: ValueFilter<V, any>): ParsedValueFilter<V>[] {
  if (filter === null) {
    return [{ kind: "is-null" }];
  } else if (filter === undefined) {
    // This is legacy behavior where `em.find(Book, { author: undefined })` would match all books
    return [];
  } else if (Array.isArray(filter)) {
    return [{ kind: "in", value: filter }];
  } else if (isPlainObject(filter)) {
    const keys = Object.keys(filter);
    if (keys.length === 0) {
      // Should this be an error?
      return [];
    } else if (keys.length === 2 && "op" in filter && "value" in filter) {
      // Probe for `findGql` op & value
      const { op, value } = filter;
      if (value === null) {
        return [{ kind: "is-null" }];
      } else {
        return [{ kind: op, value: value ?? null }];
      }
    } else if (keys.length === 2 && "gte" in filter && "lte" in filter) {
      const { gte, lte } = filter;
      return [{ kind: "between", value: [gte, lte] }];
    } else {
      return Object.entries(filter)
        .map(([key, value]) => {
          // Always do condition pruning on the value
          if (value === undefined) {
            return undefined;
          }
          switch (key) {
            case "eq":
              if (value === null) {
                return { kind: "is-null" as const };
              } else {
                return { kind: "eq" as const, value: filter[key] };
              }
            case "ne":
              if (value === null) {
                return { kind: "not-null" as const };
              } else {
                return { kind: "ne" as const, value: filter[key] ?? null };
              }
            case "in":
            case "nin":
            case "gt":
            case "gte":
            case "lt":
            case "lte":
            case "like":
            case "nlike":
            case "ilike":
            case "nilike":
            case "regex":
            case "nregex":
            case "iregex":
            case "niregex":
            case "contains":
            case "overlaps":
            case "containedBy":
              return { kind: key, value: filter[key] };
            case "search":
              return { kind: "ilike" as const, value: makeLike(filter[key]) };
            case "between":
              return { kind: key, value: filter[key] };
            default:
              throw new Error(`Unsupported value filter key ${key}`);
          }
        })
        .filter(isDefined);
    }
  } else {
    // This is a primitive like a string, number
    return [{ kind: "eq", value: filter }];
  }
}

/** Converts domain-level values like string ids/enums into their db equivalent. */
export class ConditionBuilder {
  /** Simple, single-column conditions, which will be AND-d together. */
  private conditions: ColumnCondition[] = [];
  /** Complex expressions, which will also be AND-d together with `conditions`. */
  private expressions: ParsedExpressionFilter[] = [];

  /** Accepts a raw user-facing DSL filter, and parses it into a `ParsedExpressionFilter`. */
  maybeAddExpression(expression: ExpressionFilter): void {
    const parsed = parseExpression(expression);
    if (parsed) this.expressions.push(parsed);
  }

  /** Adds an already-db-level condition to the simple conditions list. */
  addSimpleCondition(condition: ColumnCondition): void {
    this.conditions.push(condition);
  }

  /** Adds an already-db-level expression to the expressions list. */
  addParsedExpression(parsed: ParsedExpressionFilter): void {
    this.expressions.push(parsed);
  }

  /**
   * Adds a user-facing `ParsedValueFilter` to the inline conditions.
   *
   * Unless it's something like `in: [a1, null]`, in which case we split it into two `is-null` and `in` conditions.
   */
  addValueFilter(alias: string, column: Column, filter: ParsedValueFilter<any>): void {
    if (filter.kind === "in" && filter.value.includes(null)) {
      // If the filter contains a null, we need to split it into an `is-null` and `in` condition
      const isNull = {
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        cond: { kind: "is-null" },
      } satisfies ColumnCondition;
      const inValues = {
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        cond: {
          kind: "in",
          // Filter out the nulls from the in condition
          value: filter.value.filter((v) => v !== null).map((v) => column.mapToDb(v)),
        },
      } satisfies ColumnCondition;
      // Now OR them back together
      this.expressions.push({ kind: "exp", op: "or", conditions: [isNull, inValues] });
    } else {
      const cond = {
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        // Rewrite the user-facing domain values to db values
        cond: mapToDb(column, filter),
      } satisfies ColumnCondition;
      this.conditions.push(cond);
    }
  }

  /** Combines our collected `conditions` & `expressions` into a single `ParsedExpressionFilter`. */
  toExpressionFilter(): ParsedExpressionFilter | undefined {
    const { expressions, conditions } = this;
    if (conditions.length === 0 && expressions.length === 1) {
      // If no inline conditions, and just 1 opt expression, just use that
      return expressions[0];
    } else if (expressions.length === 1 && expressions[0].op === "and") {
      // Merge the 1 `AND` expression with the other simple conditions
      return { kind: "exp", op: "and", conditions: [...conditions, ...expressions[0].conditions] };
    } else if (conditions.length > 0 || expressions.length > 0) {
      // Combine the conditions within the `em.find` join literal & the `conditions` as ANDs
      return { kind: "exp", op: "and", conditions: [...conditions, ...expressions] };
    }
    return undefined;
  }

  findAndRewrite(alias: string): { cond: ColumnCondition; as: string }[] {
    let j = 0;
    const found: { cond: ColumnCondition; as: string }[] = [];
    const todo: ParsedExpressionCondition[][] = [this.conditions];
    for (const exp of this.expressions) todo.push(exp.conditions);
    while (todo.length > 0) {
      const array = todo.pop()!;
      array.forEach((cond, i) => {
        if (cond.kind === "column") {
          if (cond.alias === alias) {
            const as = `_${alias}_${cond.column}_${j++}`;
            array[i] = {
              kind: "raw",
              aliases: [alias],
              condition: `${alias}.${as}`,
              bindings: [],
              pruneable: false,
            } satisfies RawCondition;
            found.push({ cond, as });
          }
        } else if (cond.kind === "exp") {
          todo.push(cond.conditions);
        }
      });
    }
    return found;
  }
}

/** Converts domain-level values like string ids/enums into their db equivalent. */
export function mapToDb(column: Column, filter: ParsedValueFilter<any>): ParsedValueFilter<any> {
  // ...to teach this `mapToDb` function to handle/rewrite `in: [1, null]` handling, we'd need to:
  // 1. return a maybe-simple/maybe-nested condition, so basically a `ParsedExpressionCondition`, because
  // this would let `in` return an `{ or: ... }` to all the callers.
  // 2. also return `{ parsed: ParsedExpressionCondition, simples: SimpleCondition[] }` tuple, for the
  // alias `addCondition` processing to track the `simples` and rewrite their alias when later bound.
  switch (filter.kind) {
    case "eq":
    case "gt":
    case "gte":
    case "ne":
    case "lt":
    case "lte":
    case "like":
    case "nlike":
    case "ilike":
    case "nilike":
    case "regex":
    case "nregex":
    case "iregex":
    case "niregex":
      filter.value = column.mapToDb(filter.value);
      return filter;
    case "in":
      if (column.isArray) {
        // Arrays need a special operator
        return { kind: "contains", value: column.mapToDb(filter.value) };
      } else {
        filter.value = filter.value.map((v) => column.mapToDb(v));
      }
      return filter;
    case "nin":
      if (column.isArray) {
        // Arrays need a special operator
        throw new Error("The nin operator is not supported on array columns yet");
      } else {
        filter.value = filter.value.map((v) => column.mapToDb(v));
      }
      return filter;
    case "contains":
    case "ncontains":
    case "overlaps":
    case "noverlaps":
    case "containedBy":
      if (!column.isArray) {
        throw new Error(`${filter.kind} is only unsupported on array columns`);
      }
      filter.value = column.mapToDb(filter.value);
      return filter;
    case "between":
      filter.value = [column.mapToDb(filter.value[0]), column.mapToDb(filter.value[1])];
      return filter;
    case "is-null":
    case "not-null":
      return filter;
    default:
      throw assertNever(filter);
  }
}

/** Adds any user-configured default order, plus a "always order by id" for determinism. */
export function maybeAddOrderBy(query: ParsedFindQuery, meta: EntityMetadata, alias: string): void {
  const { orderBys } = query;
  if (meta.orderBy) {
    const field = meta.allFields[meta.orderBy] ?? fail(`${meta.orderBy} not found on ${meta.tableName}`);
    const column = field.serde!.columns[0].columnName;
    const hasAlready = orderBys.find((o) => o.alias === alias && o.column === column);
    if (!hasAlready) {
      orderBys.push({ alias, column, order: "ASC" });
    }
  }
  // Even if they already added orders, add id as the last one to get deterministic output
  const hasIdOrder = orderBys.find((o) => o.alias === alias && o.column === "id");
  if (!hasIdOrder) {
    orderBys.push({ alias, column: "id", order: "ASC" });
  }
}

export function addTablePerClassJoinsAndClassTag(
  query: ParsedFindQuery,
  meta: EntityMetadata,
  alias: string,
  isPrimary: boolean,
): void {
  if (!needsClassPerTableJoins(meta)) return;
  const { selects, tables } = query;
  // When `.load(SmallPublisher)` is called, join in base tables like `Publisher`
  meta.baseTypes.forEach((bt, i) => {
    if (isPrimary) {
      selects.push(`${alias}_b${i}.*`);
    }
    tables.push({
      alias: `${alias}_b${i}`,
      table: bt.tableName,
      join: "outer",
      col1: kqDot(alias, "id"),
      col2: `${alias}_b${i}.id`,
    });
  });

  // We always join in the base table in case a query happens to use
  // it as a filter, but we only need to do the subtype joins + selects
  // if this is the primary table
  if (isPrimary) {
    // Watch for subTypes that share column names. It'd be great to do
    // this statically at codegen time, like a meta.sharedSubtypeColumns.
    const stColumns: { stAlias: string; columnName: string }[] = [];

    // When `.load(Publisher)` is called, join in sub tables like `SmallPublisher` and `LargePublisher`
    meta.subTypes.forEach((st, i) => {
      const stAlias = `${alias}_s${i}`;
      selects.push(`${stAlias}.*`);
      tables.push({
        alias: stAlias,
        table: st.tableName,
        join: "outer",
        col1: kqDot(alias, "id"),
        col2: `${alias}_s${i}.id`,
      });
      for (const field of Object.values(st.fields)) {
        if (field.fieldName !== "id" && field.serde) {
          for (const c of field.serde?.columns) {
            stColumns.push({ stAlias, columnName: c.columnName });
          }
        }
      }
    });

    // Nominate a specific `id` column to avoid ambiguity
    selects.push(`${kq(alias)}.id as id`);

    // Add an explicit coalesce for shared columns
    Object.values(groupBy(stColumns, (c) => c.columnName))
      .filter((columns) => columns.length > 1)
      .forEach((columns) => {
        const { columnName } = columns[0];
        selects.push(`COALESCE(${columns.map((c) => `${c.stAlias}.${columnName}`).join(", ")}) as ${columnName}`);
      });

    // If our meta has no subtypes, we're a left type and don't need a __class
    const cases = meta.subTypes.map((st, i) => `WHEN ${alias}_s${i}.id IS NOT NULL THEN '${st.type}'`);
    if (cases.length > 0) {
      selects.push(`CASE ${cases.join(" ")} ELSE '${meta.type}' END as __class`);
    }
  }
}

export function maybeAddNotSoftDeleted(
  // Within this file we pass ConditionBuilder, but findByUniqueDataLoader passes ColumnCondition[]
  cb: ConditionBuilder | ColumnCondition[],
  softDeletes: "include" | "exclude",
  meta: EntityMetadata,
  alias: string,
): void {
  if (filterSoftDeletes(meta, softDeletes)) {
    const column = meta.allFields[getBaseMeta(meta).timestampFields.deletedAt!].serde?.columns[0]!;
    const condition = {
      kind: "column",
      alias,
      column: column.columnName,
      dbType: column.dbType,
      cond: { kind: "is-null" },
      pruneable: true,
    } satisfies ColumnCondition;
    if (cb instanceof ConditionBuilder) {
      cb.addSimpleCondition(condition);
    } else {
      cb.push(condition);
    }
  }
}

function filterSoftDeletes(meta: EntityMetadata, softDeletes: "include" | "exclude"): boolean {
  return (
    softDeletes === "exclude" &&
    !!getBaseMeta(meta).timestampFields.deletedAt &&
    // We don't support CTI subtype soft-delete filtering yet
    (meta.inheritanceType !== "cti" || meta.baseTypes.length === 0)
  );
}

/** Parses user-facing `{ and: ... }` or `{ or: ... }` into a `ParsedExpressionFilter`. */
function parseExpression(expression: ExpressionFilter): ParsedExpressionFilter | undefined {
  // Look for `{ and: [...] }` or `{ or: [...] }`
  const [op, expressions] =
    "and" in expression && expression.and
      ? ["and" as const, expression.and]
      : "or" in expression && expression.or
        ? ["or" as const, expression.or]
        : fail(`Invalid expression ${expression}`);
  // Potentially recurse into nested expressions
  const conditions = expressions.map((exp) => (exp && ("and" in exp || "or" in exp) ? parseExpression(exp) : exp));
  const [skip, valid] = partition(conditions, (cond) => cond === undefined || cond === skipCondition);
  if ((skip.length > 0 && expression.pruneIfUndefined === "any") || valid.length === 0) {
    return undefined;
  }
  return { kind: "exp", op, conditions: valid.filter(isDefined) };
}

export function getTables(query: ParsedFindQuery): [PrimaryTable, JoinTable[], LateralJoinTable[]] {
  let primary: PrimaryTable;
  const joins: JoinTable[] = [];
  const laterals: LateralJoinTable[] = [];
  for (const table of query.tables) {
    if (table.join === "primary") {
      primary = table;
    } else if (table.join === "lateral") {
      laterals.push(table);
    } else {
      joins.push(table);
    }
  }
  return [primary!, joins, laterals];
}

export function joinKeywords(join: JoinTable): string {
  return join.join === "inner" ? "JOIN" : "LEFT OUTER JOIN";
}

export function joinClause(join: JoinTable): string {
  return `${joinKeywords(join)} ${kq(join.table)} ${kq(join.alias)} ON ${join.col1} = ${join.col2}`;
}

export function joinClauses(joins: ParsedTable[]): string[] {
  return joins.map((t) => (t.join === "inner" || t.join === "outer" ? joinClause(t) : ""));
}

function needsClassPerTableJoins(meta: EntityMetadata): boolean {
  return meta.inheritanceType === "cti" && (meta.subTypes.length > 0 || meta.baseTypes.length > 0);
}

function needsStiDiscriminator(meta: EntityMetadata): boolean {
  return meta.inheritanceType === "sti" && !meta.stiDiscriminatorField;
}

function addStiSubtypeFilter(cb: ConditionBuilder, subtypeMeta: EntityMetadata, alias: string): void {
  const baseMeta = getBaseMeta(subtypeMeta);
  const column = baseMeta.fields[baseMeta.stiDiscriminatorField!].serde?.columns[0]!;
  cb.addSimpleCondition({
    kind: "column",
    alias,
    column: column.columnName,
    dbType: column.dbType,
    cond: { kind: "eq", value: subtypeMeta.stiDiscriminatorValue },
  });
}

/**
 * Given a filter that might be an `alias(Author)` placeholder, or have an `as: author`
 * binding, tells the `Alias` its canonical meta/alias.
 *
 * That way, when we later walk `conditions` and build the `AND/OR` tree, each condition
 * will know the canonical alias to output into the SQL clause.
 */
function bindAlias(filter: any, meta: EntityMetadata, alias: string) {
  // The user's locally declared aliases, i.e. `const [a, b] = aliases(Author, Book)`,
  // aren't guaranteed to line up with the aliases we've assigned internally, like `a`
  // might actually be `a1` if there are two `authors` tables in the query, so push the
  // canonical alias value for the current clause into the Alias.
  if (filter && typeof filter === "object" && "as" in filter && isAlias(filter.as)) {
    filter.as[aliasMgmt].setAlias(meta, alias);
  } else if (isAlias(filter)) {
    filter[aliasMgmt].setAlias(meta, alias);
  }
}

/** Converts a search term like `foo bar` into a SQL `like` pattern like `%foo%bar%`. */
export function makeLike(search: any | undefined): any {
  return search ? `%${search.replace(/\s+/g, "%")}%` : undefined;
}
