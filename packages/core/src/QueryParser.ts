import { groupBy, isPlainObject } from "joist-utils";
import { getAliasMgmt, getMaybeCtiAlias, isAlias } from "./Aliases";
import { Entity, isEntity } from "./Entity";
import { ExpressionFilter, OrderBy, ValueFilter } from "./EntityFilter";
import { EntityMetadata, getBaseMeta } from "./EntityMetadata";
import { rewriteCollectionJoinsToExists } from "./QueryParser.existsRewrite";
import { pruneUnusedJoins } from "./QueryParser.pruning";
import { visitConditions } from "./QueryVisitor";
import { getMetadataForTable } from "./configure";
import {
  Column,
  ConditionBuilder,
  getConstructorFromTaggedId,
  isDefined,
  keyToNumber,
  maybeResolveReferenceToId,
} from "./index";
import { kq, kqDot } from "./keywords";
import { abbreviation, assertNever, fail } from "./utils";

/** A tree of ANDs/ORs with conditions or nested conditions. */
export interface ParsedExpressionFilter {
  kind: "exp";
  op: "and" | "or";
  conditions: ParsedExpressionCondition[];
}

/** A condition or nested condition in a `ParsedExpressionFilter`. */
export type ParsedExpressionCondition = ParsedExpressionFilter | ColumnCondition | RawCondition | ExistsCondition;

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
  bindings: readonly any[];
  /** Used to mark system-added conditions (like `LATERAL JOIN` conditions), which can be ignored when pruning unused joins. */
  pruneable: boolean;
}

/** An EXISTS or NOT EXISTS subquery condition. */
export interface ExistsCondition {
  kind: "exists";
  /** When true, renders as NOT EXISTS. */
  negate: boolean;
  /** The subquery: SELECT 1 FROM child WHERE correlation AND filter. */
  subquery: ParsedFindQuery;
  /** Outer aliases referenced by the correlation predicate, for join pruning. */
  outerAliases: string[];
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

export interface JoinTable {
  join: "inner" | "outer";
  alias: string;
  table: string;
  col1: string;
  col2: string;
  distinct?: boolean;
}

/**
 * Creates a `CROSS JOIN`, currently used for our `em.find` batching.
 *
 * I.e. queries like:
 *
 * ```sql
 * WITH _find (tag, arg1, arg2) AS (VALUES
 *   (0::int, 'a'::varchar, 'a'::varchar),
 *   (1, 'b', 'b'),
 *   (2, 'c', 'c')
 * )
 * SELECT a.*, array_agg(_find.tag) AS _tags
 * FROM authors a
 * CROSS JOIN _find AS _find
 * WHERE a.first_name = _find.arg0 OR a.last_name = _find.arg1
 * GROUP BY a.id
 * ```
 */
export interface CrossJoinTable {
  join: "cross";
  /** The new alias for the joined table. */
  alias: string;
  /** The table name to join into the query. */
  table: string;
}

/**
 * Adds `WITH` CTE clauses to the query.
 *
 * I.e. queries like:
 *
 * ```sql
 * WITH _find (tag, arg0, arg1) AS (
 *   VALUES ($1::int, $2::character varying, $3::character varying), ($4, $5, $6)
 * )
 * ```
 */
export interface ParsedCteClause {
  /** The new alias for the CTE, i.e. `_find` in the above query. */
  alias: string;
  /** The columns, i.e. `tag, arg0, arg1` in the above query. */
  columns?: { columnName: string; dbType: string }[];
  /** The subquery for the AS of the CTE clause. */
  query: { kind: "raw"; sql: string; bindings: readonly any[] } | { kind: "ast"; query: ParsedFindQuery };
  /** Whether to include a `RECURSIVE` keyword after the `WITH`. */
  recursive?: boolean;
}

/**
 * Creates `LATERAL JOIN`s, currently used by `findCount` and JSON preloading.
 */
export interface LateralJoinTable {
  join: "lateral";
  alias: string;
  /** Used for join dependency tracking. */
  fromAlias: string;
  /** Used more for bookkeeping/consistency with other join tables than the query itself. */
  table: string;
  /** The subquery that will look for/roll-up N children. */
  query: ParsedFindQuery;
}

export type ParsedTable = PrimaryTable | JoinTable | CrossJoinTable | LateralJoinTable;

export interface ParsedOrderBy {
  alias: string;
  column: string;
  order: OrderBy;
}

export interface ParsedGroupBy {
  alias: string;
  column: string;
}

export type ParsedSelect = string | ParsedSelectWithBindings;
type ParsedSelectWithBindings = { sql: string; bindings: any[]; aliases: string[] };

/** The result of parsing an `em.find` filter. */
export interface ParsedFindQuery {
  selects: ParsedSelect[];
  /** The primary table plus any joins. */
  tables: ParsedTable[];
  /** The query's conditions. */
  condition?: ParsedExpressionFilter;
  /** Extremely optional group bys; we generally don't support adhoc/aggregate queries, but the auto-batching infra uses these. */
  groupBys?: ParsedGroupBy[];
  /** Any optional orders to add before the default 'order by id'. */
  orderBys: ParsedOrderBy[];
  /** Optional CTE to prefix to the query, i.e. for recursive relations. */
  ctes?: ParsedCteClause[];
}

/** Parses an `em.find` filter into a `ParsedFindQuery` AST for simpler execution. */
export function parseFindQuery(
  meta: EntityMetadata,
  filter: any,
  opts: {
    conditions?: ExpressionFilter;
    orderBy?: any;
    pruneJoins?: boolean;
    keepAliases?: string[];
    softDeletes?: "include" | "exclude";
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

  // Track collection joins (o2m/m2m) as they're added, grouped by parent alias.
  // Passed to the EXISTS rewrite so it doesn't have to re-derive collection structure.
  const collectionJoins: { parentAlias: string; join: JoinTable }[] = [];

  const aliases: Record<string, number> = {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  function maybeAddNotSoftDeleted(meta: EntityMetadata, alias: string): void {
    if (filterSoftDeletes(meta, softDeletes)) {
      const column = meta.allFields[getBaseMeta(meta).timestampFields!.deletedAt!].serde?.columns[0]!;
      cb.addSimpleCondition({
        kind: "column",
        alias,
        column: column.columnName,
        dbType: column.dbType,
        cond: { kind: "is-null" },
        pruneable: true,
      });
    }
  }

  function addTable(
    meta: EntityMetadata,
    alias: string,
    join: ParsedTable["join"],
    col1: string,
    col2: string,
    filter: any,
    fieldName?: string,
  ): void {
    // look at filter, is it `{ book: "b2" }` or `{ book: { ... } }`
    const ef = parseEntityFilter(meta, filter);
    if (!ef && join !== "primary" && !isAlias(filter)) {
      return;
    }

    if (join === "primary") {
      tables.push({ alias, table: meta.tableName, join });
      addTablePerClassJoinsAndClassTag(query, meta, alias, true);
    } else if (meta.inheritanceType === "cti" && fieldName && !(fieldName in meta.fields)) {
      // For cti, our meta might be a subtype while the FK is actually on the base table.  This should only be the case
      // when the fk is on another table (e.g. o2o/o2m).  In these cases, we'll be passed a field name and can verify if
      // its directly in our meta, if not we should assume it's in the base type and join that in first.
      meta.baseTypes.forEach((bt, i) => {
        tables.push({
          alias: `${alias}_b${i}`,
          table: bt.tableName,
          join: "outer",
          col1,
          col2: `${kq(`${alias}_b${i}`)}.${col2.split(".")[1]}`,
          distinct: false,
        });
        // and we still need to join in our subtype as well in case its own fields are queried against
        tables.push({
          alias: `${alias}`,
          table: meta.tableName,
          join: "outer",
          col1: kqDot(alias, "id"),
          col2: kqDot(`${alias}_b${i}`, "id"),
          distinct: false,
        });
      });
    } else if (join === "lateral" || join === "cross") {
      fail("Unexpected lateral join");
    } else {
      tables.push({ alias, table: meta.tableName, join, col1, col2 });
      // Maybe only do this if we're the primary, or have a field that needs it?
      addTablePerClassJoinsAndClassTag(query, meta, alias, false);
    }

    if (needsStiDiscriminator(meta)) {
      addStiSubtypeFilter(cb, meta, alias);
    }

    maybeAddNotSoftDeleted(meta, alias);

    // The user's locally declared aliases, i.e. `const [a, b] = aliases(Author, Book)`,
    // aren't guaranteed to line up with the aliases we've assigned internally, like `a`
    // might actually be `a1` if there are two `authors` tables in the query, so push the
    // canonical alias value for the current clause into the Alias.
    if (filter && typeof filter === "object" && "as" in filter && isAlias(filter.as)) {
      getAliasMgmt(filter.as).setAlias(meta, alias);
    } else if (isAlias(filter)) {
      getAliasMgmt(filter).setAlias(meta, alias);
    }

    if (ef && ef.kind === "join") {
      // subFilter really means we're matching against the entity columns/further joins
      Object.keys(ef.subFilter).forEach((key) => {
        // Skip the `{ as: ... }` alias binding
        if (key === "as") return;
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
              const comp = field.components.find((p) => {
                const otherMeta = p.otherMetadata();
                const cstr = getConstructorFromTaggedId(f.value as string);
                // tagged ids from subclasses always map to the base class, so we should compare to the base class if we don't directly match
                return otherMeta.cstr === cstr || otherMeta.baseType === cstr.name;
              });
              if (!comp) fail(`Invalid tagged id passed to ${meta.type}.${key}: ${f.value}`);
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
                const column =
                  field.serde.columns.find(
                    // tagged ids from subclasses always map to the base class, so we should compare to the base class if we don't directly match
                    (c) => c.otherMetadata().cstr.name === cstrName || c.otherMetadata().baseType === cstrName,
                  ) ?? fail(`Invalid tagged ids passed to ${meta.type}.${key}: ${ids}`);
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
          const otherMeta = field.otherMetadata();
          const a = getAlias(otherMeta.tableName);
          const otherField = otherMeta.allFields[field.otherFieldName];
          const otherColumn =
            // if our other is a poly, we need to find a matching column rather than just picking the first
            otherField.kind === "poly"
              ? otherField.components.find(
                  (c) => c.otherMetadata() === meta || c.otherMetadata() === getBaseMeta(meta),
                )!.columnName
              : otherField.serde!.columns[0].columnName;
          addTable(
            field.otherMetadata(),
            a,
            "outer",
            kqDot(alias, "id"),
            kqDot(a, otherColumn),
            (ef.subFilter as any)[key],
            field.otherFieldName,
          );
        } else if (field.kind === "o2m") {
          const a = getAlias(field.otherMetadata().tableName);
          const otherField = field.otherMetadata().allFields[field.otherFieldName];
          let otherColumn = otherField.serde!.columns[0].columnName;
          // If the other field is a poly, we need to find the right column
          if (otherField.kind === "poly") {
            // For a subcomponent that matches field's metadata
            const otherComponent =
              otherField.components.find((c) => c.otherMetadata() === meta) ??
              fail(`No poly component found for ${otherField.fieldName}`);
            otherColumn = otherComponent.columnName;
          }
          addTable(
            field.otherMetadata(),
            a,
            "outer",
            kqDot(alias, "id"),
            kqDot(a, otherColumn),
            (ef.subFilter as any)[key],
            field.otherFieldName,
          );
          // Record after addTable so the JoinTable is in `tables`
          const o2mJoin = tables.find((t) => t.alias === a) as JoinTable;
          if (o2mJoin) collectionJoins.push({ parentAlias: alias, join: o2mJoin });
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
          // Record the junction table as a collection join
          const m2mJoin = tables[tables.length - 1] as JoinTable;
          collectionJoins.push({ parentAlias: alias, join: m2mJoin });
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
          addTablePerClassJoinsAndClassTag(query, field.otherMetadata(), table.alias, false);
          addOrderBy(field.otherMetadata(), table.alias, value);
        } else {
          const table = field.otherMetadata().tableName;
          const a = getAlias(table);
          const column = field.serde.columns[0].columnName;
          const fa = getMaybeCtiAlias(meta, field, meta, alias);
          // If we don't have a join, don't force this to be an inner join
          tables.push({
            alias: a,
            table,
            join: "outer",
            col1: kqDot(fa, column),
            col2: kqDot(a, "id"),
            distinct: false,
          });
          addTablePerClassJoinsAndClassTag(query, field.otherMetadata(), a, false);
          addOrderBy(field.otherMetadata(), a, value);
        }
      } else {
        throw new Error(`Unsupported field ${key}`);
      }
    }
  }

  // always add the main table
  const alias = getAlias(meta.tableName);
  selects.push(`${kq(alias)}.*`);
  addTable(meta, alias, "primary", "n/a", "n/a", filter);

  // If they passed extra `conditions: ...`, parse that
  if (optsExpression) {
    cb.maybeAddExpression(optsExpression);
  }

  Object.assign(query, {
    condition: cb.toExpressionFilter(),
  });

  rewriteCollectionJoinsToExists(query, collectionJoins);

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

/** Returns the `a` from `"a".*`. */
export function parseAlias(alias: string): string {
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
  | { kind: "between"; value: [V, V] }
  | { kind: "jsonPathExists"; value: string }
  | { kind: "jsonPathPredicate"; value: string };

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
            case "pathExists":
              return { kind: "jsonPathExists" as const, value: filter[key] };
            case "pathIsTrue":
              return { kind: "jsonPathPredicate" as const, value: filter[key] };
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
      const supportsContains = column.isArray || column.dbType === "jsonb";
      if (!supportsContains) {
        throw new Error(`${filter.kind} is only unsupported on array or jsonb columns`);
      }
      if (column.isArray) {
        filter.value = column.mapToDb(filter.value);
      } else {
        // leave jsonb values alone
      }
      return filter;
    case "between":
      filter.value = [column.mapToDb(filter.value[0]), column.mapToDb(filter.value[1])];
      return filter;
    case "is-null":
    case "not-null":
    case "jsonPathExists":
    case "jsonPathPredicate":
      return filter;
    default:
      throw assertNever(filter);
  }
}

/** Adds any user-configured default order, plus an "always order by id" for determinism. */
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
      distinct: false,
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
        distinct: false,
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
      selects.push(`CASE ${cases.join(" ")} ELSE '_' END as __class`);
    }
  }
}

export function maybeAddNotSoftDeleted(
  conditions: ColumnCondition[],
  meta: EntityMetadata,
  alias: string,
  softDeletes: "include" | "exclude",
): void {
  if (filterSoftDeletes(meta, softDeletes)) {
    const column = meta.allFields[getBaseMeta(meta).timestampFields!.deletedAt!].serde?.columns[0]!;
    conditions.push({
      kind: "column",
      alias,
      column: column.columnName,
      dbType: column.dbType,
      cond: { kind: "is-null" },
    });
  }
}

function filterSoftDeletes(meta: EntityMetadata, softDeletes: "include" | "exclude"): boolean {
  return (
    softDeletes === "exclude" &&
    !!getBaseMeta(meta).timestampFields?.deletedAt &&
    // We don't support CTI subtype soft-delete filtering yet
    (meta.inheritanceType !== "cti" || meta.baseTypes.length === 0)
  );
}

export function getTables(query: ParsedFindQuery): [PrimaryTable, JoinTable[], LateralJoinTable[], CrossJoinTable[]] {
  let primary: PrimaryTable;
  const joins: JoinTable[] = [];
  const laterals: LateralJoinTable[] = [];
  const crosses: CrossJoinTable[] = [];
  for (const table of query.tables) {
    if (table.join === "primary") {
      primary = table;
    } else if (table.join === "lateral") {
      laterals.push(table);
    } else if (table.join === "cross") {
      crosses.push(table);
    } else {
      joins.push(table);
    }
  }
  return [primary!, joins, laterals, crosses];
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
    pruneable: true,
  });
}

/** Converts a search term like `foo bar` into a SQL `like` pattern like `%foo%bar%`. */
export function makeLike(search: any | undefined): any {
  return search ? `%${search.replace(/\s+/g, "%")}%` : undefined;
}
