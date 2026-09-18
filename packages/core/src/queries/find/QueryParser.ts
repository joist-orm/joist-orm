import { groupBy } from "joist-utils";

import { getConstructorFromTaggedId, getMetadataForTable } from "../../configure.ts";
import type { Entity } from "../../Entity.ts";
import { type EntityMetadata, type Field, getBaseMeta } from "../../EntityMetadata.ts";
import { keyToNumber, maybeResolveReferenceToId } from "../../keys.ts";
import { abbreviation, fail } from "../../utils.ts";
import { ConditionBuilder } from "../ConditionBuilder.ts";
import { type ConditionInput, predicateBrand } from "../conditions.ts";
import { filterSoftDeletes, lazyExcludedSelects, stiSubtypeFilter } from "../entityQueryUtils.ts";
import type { ColumnCondition, ParsedExpressionFilter, RawCondition } from "../parsedConditions.ts";
import { isDeferredCondition } from "../sql/Expr.ts";
import { kq, kqDot } from "../sql/keywords.ts";
import {
  type ParsedEntityFilter,
  isNilIdValue,
  mapToDb,
  parseEntityFilter,
  parseValueFilter,
} from "../valueFilters.ts";
import { type AliasMgmt, getAliasMgmt, getMaybeCtiAlias, isAlias, alias as newAlias } from "./Aliases.ts";
import { deferredAliasSym, isDeferredAliasCondition } from "./DeferredAlias.ts";
import type { ExpressionFilter, OrderBy } from "./EntityFilter.ts";
import { pruneUnusedJoins } from "./QueryParser.pruning.ts";
import { visitConditions } from "./QueryVisitor.ts";
import { type Scope, isScope, isScopeJoinFilter, resolveScope } from "./scopes.ts";

// `skipCondition` lives in its own leaf module, shared by domain aliases and SQL expressions
// without a load-order cycle; `index.ts` re-exports it directly.

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
  /**
   * Metadata used by `optimizeCollectionJoins` to rewrite collection joins into EXISTS.
   *
   * I.e. for `Author.books.reviews`:
   * ```sql
   * authors a
   * LEFT JOIN books b ON a.id = b.author_id
   * LEFT JOIN book_reviews br ON b.id = br.book_id
   * ```
   * `books b` has `parentAlias: "a"` and `rootAlias: "b"`, while `book_reviews br` has
   * `parentAlias: "b"` and `rootAlias: "br"`.
   *
   * I.e. for `Author.tags`, the m2m join table is the collection root:
   * ```sql
   * authors a
   * LEFT JOIN authors_to_tags att ON a.id = att.author_id
   * LEFT JOIN tags t ON att.tag_id = t.id
   * ```
   * `authors_to_tags att` has `alias: "att"` and `rootAlias: "att"`, while `tags t` has `alias: "t"`
   * but still has `rootAlias: "att"` because it belongs to the m2m subtree rooted at the join table.
   */
  collection?: {
    /** The collection relation type, i.e. `o2m` for `Author.books`, or `m2m` for `Author.tags`. */
    kind: "o2m" | "m2m";
    /** The alias that owns this collection path, i.e. `a` for `Author.books`, or `att` for `Author.tags -> tags`. */
    parentAlias: string;
    /** The top-level alias in this collection subtree, i.e. `b` for `Author.books.reviews`, or `att` for `Author.tags`. */
    rootAlias: string;
  };
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
  /** Optional settings for the subquery, i.e. per-parent pagination. */
  settings?: { limit?: number; offset?: number };
}

export type ParsedTable = PrimaryTable | JoinTable | CrossJoinTable | LateralJoinTable;

export interface ParsedOrderBy {
  alias: string;
  column: string;
  order: OrderBy;
}

export type ParsedGroupBy = { alias: string; column: string } | { expression: string };

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

/**
 * Parses an `em.find` filter into a logical `ParsedFindQuery` AST, leaving optimization/pruning to callers.
 *
 * The main execution flow is:
 * parseFindQuery -> beforeFind plugins -> optimizeCollectionJoins -> pruneUnusedJoins -> execute SQL.
 */
export function parseFindQuery(
  meta: EntityMetadata,
  filter: any,
  opts: {
    conditions?: ExpressionFilter;
    orderBy?: any;
    pruneJoins?: boolean;
    keepAliases?: string[];
    softDeletes?: "include" | "exclude";
    allowMultipleLeftJoins?: boolean;
    optimizeJoinsToExists?: boolean;
  } = {},
): ParsedFindQuery {
  const selects: string[] = [];
  const tables: ParsedTable[] = [];
  const orderBys: ParsedOrderBy[] = [];
  const query: ParsedFindQuery = { selects, tables, orderBys };
  const { orderBy, conditions: optsExpression, softDeletes = "exclude", pruneJoins = false, keepAliases = [] } = opts;
  const cb = new ConditionBuilder();
  // Where each user-created `alias(...)` is bound in this parse's join literal; alias-built conditions
  // (`a.firstName.eq(...)`) are resolved against it once the whole tree is walked
  const aliasBindings = new Map<AliasMgmt, { meta: EntityMetadata; alias: string }>();

  const aliases: Record<string, number> = {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  /** Adds a `deleted_at IS NULL` condition for `alias`, i.e. for the primary table or a collection join. */
  function addSoftDeleteCondition(meta: EntityMetadata, alias: string, targetCb: ConditionBuilder): void {
    if (filterSoftDeletes(meta, softDeletes)) {
      const column = meta.allFields[getBaseMeta(meta).timestampFields!.deletedAt!].serde?.columns[0]!;
      targetCb.addSimpleCondition({
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
    targetCb: ConditionBuilder = cb,
    /** Whether this table is the "other side" of a collection, i.e. `books` in `em.find(Author, { books: ... })`. */
    isCollection: boolean = false,
  ): void {
    // look at filter, is it `{ book: "b2" }` or `{ book: { ... } }`
    const scopeFilter = isScope(filter);
    const ef = scopeFilter ? undefined : parseEntityFilter(meta, filter);
    if (!scopeFilter && !ef && join !== "primary" && !isAlias(filter)) {
      return;
    }

    if (join === "primary") {
      tables.push({ alias, table: meta.tableName, join });
      addTablePerClassJoinsAndClassTag({ selects, tables, orderBys }, meta, alias, true);
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
      addTablePerClassJoinsAndClassTag({ selects, tables, orderBys }, meta, alias, false);
    }

    if (needsStiDiscriminator(meta)) {
      addStiSubtypeFilter(targetCb, meta, alias);
    }

    // Only the primary table & collection joins filter soft-deletes, to match the in-memory relation
    // semantics of "o2m/m2m collections filter out soft-deletes, but m2o/o2o references still return
    // them". I.e. `book.author.get` returns a soft-deleted author, so `em.find(Book, { author: ... })`
    // should still match the book, as long as the book itself is not soft-deleted.
    if (join === "primary" || isCollection) {
      addSoftDeleteCondition(meta, alias, targetCb);
    }

    // The user's locally declared aliases, i.e. `const [a, b] = aliases(Author, Book)`,
    // aren't guaranteed to line up with the aliases we've assigned internally, like `a`
    // might actually be `a1` if there are two `authors` tables in the query, so push the
    // canonical alias value for the current clause into the Alias.
    if (filter && typeof filter === "object" && "as" in filter && isAlias(filter.as)) {
      aliasBindings.set(getAliasMgmt(filter.as), { meta, alias });
    } else if (isAlias(filter)) {
      aliasBindings.set(getAliasMgmt(filter), { meta, alias });
    }

    addFilterAt(meta, alias, filter, targetCb, ef, join);
  }

  function addFilterAt(
    meta: EntityMetadata,
    tableAlias: string,
    filter: any,
    targetCb: ConditionBuilder,
    parsed: ParsedEntityFilter | undefined = parseEntityFilter(meta, filter),
    parentJoin: ParsedTable["join"] = "primary",
  ): void {
    if (isScope(filter)) {
      addScopeFilterAt(meta, tableAlias, filter, targetCb, parentJoin);
    } else if (parsed && parsed.kind === "join") {
      addSubFilter(meta, tableAlias, parsed.subFilter, targetCb, parentJoin);
    } else if (parsed) {
      const column = meta.fields["id"].serde!.columns[0];
      targetCb.addValueFilter(tableAlias, column, parsed);
    }
  }

  function addScopeFilterAt<T extends Entity>(
    meta: EntityMetadata<T>,
    tableAlias: string,
    scope: Scope<T>,
    targetCb: ConditionBuilder,
    parentJoin: ParsedTable["join"],
  ): void {
    for (const fragment of resolveScope(scope).fragments) {
      if (fragment.kind === "filter") {
        addFilterAt(meta, tableAlias, fragment.filter, targetCb, undefined, parentJoin);
      } else {
        const a = newAlias(meta.cstr);
        const result = fragment.fn(a);
        aliasBindings.set(getAliasMgmt(a), { meta, alias: tableAlias });
        if (isScopeJoinFilter(result)) {
          // Parse the join tree first so its `as:` bindings re-root the aliases that
          // `conditions` reference, then add the conditions against the now-bound aliases.
          addFilterAt(meta, tableAlias, result.where, targetCb, undefined, parentJoin);
          checkDomainCondition(result.conditions);
          targetCb.maybeAddExpression(result.conditions);
        } else {
          const conditions = Array.isArray(result) ? result : [result];
          for (const condition of conditions) checkDomainCondition(condition);
          if (conditions.length > 0) targetCb.maybeAddExpression({ and: conditions });
        }
      }
    }
  }

  function addSubFilter(
    meta: EntityMetadata,
    tableAlias: string,
    subFilter: object,
    targetCb: ConditionBuilder,
    parentJoin: ParsedTable["join"],
  ): void {
    // subFilter really means we're matching against the entity columns/further joins
    Object.keys(subFilter).forEach((key) => {
      // Skip the `{ as: ... }` alias binding
      if (key === "as") return;
      if (key === "and" || key === "or") {
        addLogicalFilter(meta, tableAlias, key, (subFilter as any)[key], targetCb, parentJoin);
        return;
      }
      const field = findFilterField(meta, key) ?? fail(`Field '${key}' not found on ${meta.tableName}`);
      const fa = `${tableAlias}${field.aliasSuffix}`;
      if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
        const column = field.serde.columns[0];
        parseValueFilter((subFilter as any)[key]).forEach((filter) => {
          targetCb.addValueFilter(fa, column, filter);
        });
      } else if (field.kind === "m2o") {
        const column = field.serde.columns[0];
        const sub = (subFilter as any)[key];
        const joinKind = field.required && parentJoin !== "outer" ? "inner" : "outer";
        if (isAlias(sub)) {
          const a = getAlias(field.otherMetadata().tableName);
          addTable(
            field.otherMetadata(),
            a,
            joinKind,
            kqDot(fa, column.columnName),
            kqDot(a, "id"),
            sub,
            undefined,
            targetCb,
          );
        }
        const f = parseEntityFilter(field.otherMetadata(), sub);
        // Probe the filter and see if it's just an id, if so we can avoid the join; m2os don't need
        // a join for soft-delete filtering because references don't filter out soft-deletes.
        if (!f) {
          // skip
        } else if (f.kind === "join") {
          const a = getAlias(field.otherMetadata().tableName);
          addTable(
            field.otherMetadata(),
            a,
            joinKind,
            kqDot(fa, column.columnName),
            kqDot(a, "id"),
            sub,
            undefined,
            targetCb,
          );
        } else {
          targetCb.addValueFilter(fa, column, f);
        }
      } else if (field.kind === "poly") {
        const f = parseEntityFilter(meta, (subFilter as any)[key]);
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
            targetCb.addValueFilter(fa, column, f);
          } else if (f.kind === "is-null") {
            // Add a condition for every component--these can be AND-d with the rest of the simple/inline conditions
            field.components.forEach((comp) => {
              const column = field.serde.columns.find((c) => c.columnName === comp.columnName)!;
              targetCb.addSimpleCondition({
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
            targetCb.addParsedExpression({ kind: "exp", op: "or", conditions });
          } else if (f.kind === "in") {
            // An empty `in` matches nothing, so emit a single always-false condition (consistent
            // with a non-poly m2o `{ relation: [] }`); otherwise grouping by constructor would yield
            // zero conditions and prune the filter entirely, incorrectly matching every row.
            if (f.value.length === 0) {
              targetCb.addValueFilter(fa, field.serde.columns[0], { kind: "in", value: [] });
              return;
            }
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
            targetCb.addParsedExpression({ kind: "exp", op: "or", conditions });
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
            ? otherField.components.find((c) => c.otherMetadata() === meta || c.otherMetadata() === getBaseMeta(meta))!
                .columnName
            : otherField.serde!.columns[0].columnName;
        addTable(
          field.otherMetadata(),
          a,
          "outer",
          kqDot(tableAlias, "id"),
          kqDot(a, otherColumn),
          (subFilter as any)[key],
          field.otherFieldName,
          targetCb,
        );
      } else if (field.kind === "o2m") {
        const otherMeta = field.otherMetadata();
        const otherField = otherMeta.allFields[field.otherFieldName];
        let otherColumn = otherField.serde!.columns[0].columnName;
        if (otherField.kind === "poly") {
          const otherComponent =
            otherField.components.find((c) => c.otherMetadata() === meta) ??
            fail(`No poly component found for ${otherField.fieldName}`);
          otherColumn = otherComponent.columnName;
        }
        const isCtiBaseFk =
          otherMeta.inheritanceType === "cti" && field.otherFieldName && !(field.otherFieldName in otherMeta.fields);
        const a = getAlias(otherMeta.tableName);
        addTable(
          otherMeta,
          a,
          "outer",
          kqDot(tableAlias, "id"),
          kqDot(a, otherColumn),
          (subFilter as any)[key],
          field.otherFieldName,
          targetCb,
          true,
        );
        if (!isCtiBaseFk) {
          const table = tables.find((t) => t.alias === a);
          if (table && (table.join === "inner" || table.join === "outer")) {
            table.collection = { parentAlias: tableAlias, rootAlias: a, kind: "o2m" };
          }
        }
      } else if (field.kind === "m2m") {
        const sub = (subFilter as any)[key];
        const f = parseEntityFilter(field.otherMetadata(), sub);
        if (!f && !isAlias(sub)) return;

        const ja = getAlias(field.joinTableName);
        tables.push({
          join: "outer",
          alias: ja,
          table: field.joinTableName,
          col1: kqDot(tableAlias, "id"),
          col2: kqDot(ja, field.columnNames[0]),
          collection: { parentAlias: tableAlias, rootAlias: ja, kind: "m2m" },
        });

        if (isAlias(sub) || f?.kind === "join" || filterSoftDeletes(field.otherMetadata(), softDeletes)) {
          const a = getAlias(field.otherMetadata().tableName);
          addTable(
            field.otherMetadata(),
            a,
            "outer",
            kqDot(ja, field.columnNames[1]),
            kqDot(a, "id"),
            sub,
            undefined,
            targetCb,
            true,
          );
          const table = tables.find((t) => t.alias === a);
          if (table && (table.join === "inner" || table.join === "outer")) {
            table.collection = { parentAlias: ja, rootAlias: ja, kind: "m2m" };
          }
        } else if (f) {
          const otherMeta = field.otherMetadata();
          const column: any = {
            columnName: field.columnNames[1],
            dbType: otherMeta.idDbType,
            mapToDb(value: any) {
              return value === null || isNilIdValue(value)
                ? value
                : keyToNumber(otherMeta, maybeResolveReferenceToId(value));
            },
          };
          targetCb.addSimpleCondition({
            kind: "column",
            alias: ja,
            column: field.columnNames[1],
            dbType: otherMeta.idDbType,
            cond: mapToDb(column, f),
          });
        }
      } else if (field.kind === "m2mEnum") {
        // Membership filter, e.g. `{ logoColors: Color.Red }` / `{ logoColors: [Red, Green] }`: join the
        // join table and filter its enum-id column, mapping enum codes -> their numeric ids.
        const ja = getAlias(field.joinTableName);
        tables.push({
          join: "outer",
          alias: ja,
          table: field.joinTableName,
          col1: kqDot(tableAlias, "id"),
          col2: kqDot(ja, field.columnNames[0]),
          collection: { parentAlias: tableAlias, rootAlias: ja, kind: "m2m" },
        });
        const column: any = {
          columnName: field.columnNames[1],
          dbType: "int",
          mapToDb(value: any) {
            return value === null || value === undefined ? value : field.enumDetailType.getByCode(value).id;
          },
        };
        parseValueFilter((subFilter as any)[key]).forEach((filter) => {
          targetCb.addValueFilter(ja, column, filter);
        });
      } else {
        throw new Error(`Unsupported field ${key}`);
      }
    });
  }

  function addLogicalFilter(
    meta: EntityMetadata,
    tableAlias: string,
    op: "and" | "or",
    value: unknown,
    targetCb: ConditionBuilder,
    parentJoin: ParsedTable["join"],
  ): void {
    const filters = Array.isArray(value) ? value : [value];
    const conditions = filters.flatMap((filter) => {
      const branchCb = new ConditionBuilder();
      addFilterAt(meta, tableAlias, filter, branchCb, undefined, parentJoin);
      const condition = branchCb.toExpressionFilter();
      return condition ? [condition] : [];
    });
    if (conditions.length > 0) targetCb.addParsedExpression({ kind: "exp", op, conditions });
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
  if (meta.hasLazyColumns) {
    selects.push(...lazyExcludedSelects(meta, alias));
  } else {
    selects.push(`${kq(alias)}.*`);
  }
  addTable(meta, alias, "primary", "n/a", "n/a", filter);

  // If they passed extra `conditions: ...`, parse that
  if (optsExpression) {
    checkDomainCondition(optsExpression);
    cb.maybeAddExpression(optsExpression);
  }

  Object.assign(query, {
    condition: cb.toExpressionFilter(),
  });

  // Resolve alias-built conditions against this parse's bindings, before anything reads their
  // aliases (the id-not-null injection just below, and join pruning)
  resolveAliasConditions(query, aliasBindings);

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
export function maybeAddIdNotNulls(query: ParsedFindQuery): void {
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

/** Finds a filter field by fieldName or generated fieldIdName. */
export function findFilterField(meta: EntityMetadata, key: string): (Field & { aliasSuffix: string }) | undefined {
  return (
    meta.allFields[key] ??
    meta.polyComponentFields?.[key] ??
    Object.values(meta.allFields).find((field) => field.fieldIdName === key) ??
    Object.values(meta.polyComponentFields ?? {}).find((field) => field.fieldIdName === key)
  );
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

/** Rejects SQL predicates throughout a domain condition tree before optional-filter pruning. */
function checkDomainCondition(condition: ConditionInput | undefined): void {
  if (!condition) return;
  if (isDeferredCondition(condition) || (predicateBrand in condition && condition[predicateBrand] === "sql")) {
    fail("SQL predicates are only supported by em.query/em.execute; use alias(...) predicates in em.find and scopes.");
  }
  if ("and" in condition && condition.and) {
    for (const child of condition.and) checkDomainCondition(child);
  } else if ("or" in condition && condition.or) {
    for (const child of condition.or) checkDomainCondition(child);
  }
}

/** Resolves every `DeferredAliasCondition` in `query` against the parse's alias bindings. */
function resolveAliasConditions(
  query: ParsedFindQuery,
  bindings: Map<AliasMgmt, { meta: EntityMetadata; alias: string }>,
): void {
  function resolve(handle: AliasMgmt): { meta: EntityMetadata; alias: string } {
    return bindings.get(handle) ?? fail(`Alias for ${handle.tableName} is not bound to this query's join literal`);
  }
  function maybeResolve<C extends ColumnCondition | RawCondition>(c: C): C | undefined {
    return isDeferredAliasCondition(c) ? c[deferredAliasSym](resolve) : undefined;
  }
  visitConditions(query, { visitCond: maybeResolve, visitRaw: maybeResolve });
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
  const cond = stiSubtypeFilter(subtypeMeta, alias);
  if (cond) cb.addSimpleCondition(cond);
}
