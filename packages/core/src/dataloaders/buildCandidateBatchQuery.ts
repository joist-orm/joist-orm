import { collectFindArguments } from "src/dataloaders/collectFindArguments.ts";
import type { OpColumn } from "src/drivers/EntityWriter.ts";
import { buildRawQuery } from "src/queries/find/buildFindQuery.ts";
import type { ParsedCteClause, ParsedFindQuery, ParsedSelect } from "src/queries/find/QueryParser.ts";
import type {
  ColumnCondition,
  ParsedExpressionCondition,
  ParsedExpressionFilter,
  ParsedValueFilter,
} from "src/queries/parsedConditions.ts";
import { buildValueCondition, buildWhereClause } from "src/queries/renderConditions.ts";
import { kq, kqDot } from "src/queries/sql/keywords.ts";
import { buildUnnestCte } from "src/queries/unnest.ts";

/** One individual em.find call included in this batch of finds with the same query structure. */
interface FindEntry {
  query: ParsedFindQuery;
  bindings: unknown[];
}

/**
 * Connects one filter to its per-call arguments and optional combined candidate values.
 *
 * I.e. `title IN ['one']` / `IN ['two']` uses columnNames = ['arg0'] to read each call's
 * list from _find, and allValues = ['one', 'two'] to select broad candidates.
 * Numeric ranges instead use range: BETWEEN 20 AND 30 / BETWEEN 40 AND 50
 * becomes BETWEEN 20 AND 50 for candidates. The exact-match phase still reads both bounds from _find.
 */
interface BatchFilterArgs {
  /** The exact-match phase reads each call's filter values from these _find columns. */
  columnNames: string[];
  /** The candidate phase uses these distinct eq/in values across all calls as a broad IN filter. */
  allValues?: unknown[];
  /** The candidate phase uses these broad numeric bounds; absent when comparing outside PostgreSQL is unsafe. */
  range?: ParsedValueFilter<number>;
}

/** The _find CTE and the mapping from filters to its argument columns. */
interface FindArguments {
  cte: ParsedCteClause;
  filters: Map<ColumnCondition, BatchFilterArgs>;
}

/**
 * Describes a SQL expression computed once per candidate or child row and reused for each call's filter.
 *
 * Its result is held in the candidate CTE, either as a column or within a child-record array.
 *
 * I.e. `{ name: "_c0", dbType: "int", sql: "a.age", bindings: [] }` selects `a.age AS _c0`.
 * An author aged 30 contributes the value 30, which the exact-match phase compares with each call's age filter.
 *
 * `{ name: "_c0", dbType: "books", sql: "b", bindings: [], sourceAlias: "b" }` selects a whole
 * book row as a field inside a child record. The exact-match phase reads its title and order from that same book.
 */
interface CandidateSelectValue {
  name: string;
  dbType: string;
  sql: string;
  bindings: unknown[];
  /** Present when projecting a table's native composite row, shared by all predicates on that alias. */
  sourceAlias?: string;
}

/**
 * Describes the candidate values and exact-match conditions for one level of the batch's nested filters.
 *
 * The candidate phase collects the values in `select`; the exact-match phase checks those values
 * against each call using `exactMatchSql`.
 *
 * Each batch has one top-level BatchLevel, plus one for each child EXISTS handled through a
 * record array, recursively. Shared EXISTS filters and simple positive eq/in filters handled
 * by scalar-array overlap add no level. Levels are created per batch, not per call or database row.
 * Each collection branch gets its own level: books and tags have separate levels at the same depth.
 *
 * I.e. authors -> books -> reviews uses three levels when both child collections use record arrays.
 * The author level collects book records; the book level describes their fields and same-book
 * exact-match phase conditions, including review records described by the review level.
 */
interface BatchLevel {
  /** Alias used to read collected values in the exact-match phase; i.e. "a" for _cand or "_r0" for unnested books. */
  alias: string;
  /** Values collected during the candidate phase, as top-level columns or fields inside child records. */
  select: CandidateSelectValue[];
  /** Exact-match phase condition comparing collected values with one call's _find arguments. */
  exactMatchSql: string;
  /** Source alias to table name, including outer levels; the candidate phase uses this to type native rows, i.e. "b" -> "books". */
  tables: Map<string, string>;
  /** Whether this level is inside a child record array; the candidate phase then collects native rows so the exact-match phase retains column collations. */
  nested: boolean;
}

interface ExactMatchContext {
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>;
  nextAlias: number;
}

/**
 * Shares the candidate phase and child lookups across finds by compiling their filter tree.
 *
 * Before: each (author, find entry) pair repeats a collection lookup, then GROUP BY combines tags.
 * Here `_find(tag, arg0)` contains `(0, ['one'])`, `(1, ['two'])`. Simplified SQL:
 *
 * ```sql
 * SELECT a.*, array_agg(f.tag) AS _tags
 * FROM authors a CROSS JOIN _find f
 * WHERE EXISTS (SELECT 1 FROM books b
 *               WHERE b.author_id = a.id AND b.title = ANY(f.arg0))
 * GROUP BY a.id;
 * ```
 *
 * After: collect child values once per candidate and compare them in SQL for each entry:
 *
 * ```sql
 * WITH _find(tag, arg0) AS MATERIALIZED (
 *   SELECT unnest($1::int[]), unnest_arrays($2::varchar[][])
 * ), _cand AS MATERIALIZED (
 *   SELECT a AS _entity,
 *          ARRAY(SELECT b.title FROM books b
 *                WHERE b.author_id = a.id AND b.title = ANY(ARRAY['one', 'two'])) AS _c0
 *   FROM authors a
 *   WHERE EXISTS (SELECT 1 FROM books b
 *                 WHERE b.author_id = a.id AND b.title = ANY(ARRAY['one', 'two']))
 * ), _matched AS MATERIALIZED (
 *   SELECT c._entity,
 *          ARRAY(SELECT f.tag FROM _find f WHERE c._c0 && f.arg0) AS _tags
 *   FROM _cand c
 * )
 * SELECT (m._entity).*, m._tags FROM _matched m WHERE cardinality(m._tags) > 0;
 * ```
 *
 * Here $1 = [0, 1] and $2 = [['one'], ['two']]. The existing buildUnnestCte helper
 * binds arrays, so the _find SQL text stays the same as the number of entries changes.
 *
 * General child predicates use arrays of SQL records instead of independent arrays. I.e. books
 * `(title=one, order=2)` and `(title=two, order=1)` must not match `(title=one AND order=1)`.
 * Each record holds both values from the same child; nested EXISTS recursively collect child-record arrays.
 * Simple positive membership still uses scalar-array overlap, preserving the production fast path.
 *
 * @param query The first entry's prepared query. All entries have the same query structure.
 * @param entries One entry per distinct find, with column-filter values collected in `visitConditions` order.
 * An IN list occupies one slot and BETWEEN occupies two. Raw SQL bindings stay in the query, not this list.
 * @param constantBindings For each binding slot, whether every entry has the same value. I.e. bindings
 * `[30, ["one"]]` and `[30, ["two"]]` give `[true, false]`: age is shared, but the title list varies.
 */
export function buildCandidateBatchQuery(
  query: ParsedFindQuery,
  entries: readonly FindEntry[],
  constantBindings: readonly boolean[],
): ParsedFindQuery | undefined {
  if (!query.condition || !hasCollectionCondition(query.condition) || query.ctes?.length || query.groupBys?.length)
    return;
  const primary = query.tables.find((t) => t.join === "primary")!;
  if (!canSelectCandidateEntities(query, primary.alias)) return;

  // _find: one row per call, containing its tag and the filter values that differ between calls.
  const findArguments = buildFindArguments(query, entries, constantBindings);
  if (!findArguments) return;
  const perCallFilters = findArguments.filters;

  // Candidate phase (_cand): select broad candidates and collect values needed for the exact-match phase.
  const exactMatchCondition = conditionsForExactMatch(query.condition, perCallFilters);
  if (!canProjectCondition(exactMatchCondition)) return;
  const context: ExactMatchContext = { perCallFilters, nextAlias: 0 };
  const batchLevel = buildBatchLevel(query, exactMatchCondition, primary.alias, context);
  const selects: ParsedSelect[] = [
    // A table's composite row expands back to its original columns without sending helper arrays.
    `${kq(primary.alias)} AS _entity`,
    ...batchLevel.select.map((v) => ({
      sql: `${v.sql} AS ${v.name}`,
      bindings: v.bindings,
      aliases: [primary.alias],
    })),
  ];

  // Carry sort values through the fence, including to-one joined columns and PostgreSQL NULL ordering.
  const orderBys = query.orderBys.map((orderBy, index) => {
    const column = `_o${index}`;
    selects.push(`${kqDot(orderBy.alias, orderBy.column)} AS ${column}`);
    return { ...orderBy, alias: primary.alias, column };
  });

  // The exact-match phase must carry these columns forward for the final ORDER BY.
  const orderSelects = orderBys.map((o) => kqDot(o.alias, o.column));

  // Apply broad filters in the candidate phase; ordering happens after the exact-match phase.
  const candidateCondition = buildCandidateCondition(query.condition, perCallFilters);
  const candidateCte: ParsedCteClause = {
    alias: "_cand",
    materialized: true,
    query: {
      kind: "ast",
      query: {
        ...query,
        // These joins return at most one row per parent, so DISTINCT is unnecessary.
        tables: withoutDistinct(query.tables),
        selects,
        condition: candidateCondition,
        orderBys: [],
      },
    },
  };

  // Exact-match phase (_matched): compare candidate values with _find and collect matching call tags.
  const exactMatchCte: ParsedCteClause = {
    alias: "_matched",
    // Prevent PostgreSQL from evaluating the tag subquery twice:
    // once for the nonempty-tags filter and again for the returned tags.
    materialized: true,
    query: {
      kind: "ast",
      query: {
        selects: [
          kqDot(primary.alias, "_entity"),
          ...orderSelects,
          `ARRAY(SELECT _find.tag FROM _find WHERE ${batchLevel.exactMatchSql}) AS _tags`,
        ],
        tables: [{ join: "primary", table: "_cand", alias: primary.alias }],
        orderBys: [],
      },
    },
  };

  // Only entities with matching calls reach hydration, ordering, and the entity limit.
  return {
    selects: [`(${kqDot(primary.alias, "_entity")}).*`, kqDot(primary.alias, "_tags")],
    tables: [{ join: "primary", table: "_matched", alias: primary.alias }],
    condition: {
      kind: "exp",
      op: "and",
      conditions: [
        {
          kind: "raw",
          condition: `cardinality(${kqDot(primary.alias, "_tags")}) > 0`,
          aliases: [primary.alias],
          bindings: [],
          pruneable: false,
        },
      ],
    },
    // Ordering and the caller's entity limit apply only after the exact-match phase.
    orderBys,
    ctes: [findArguments.cte, candidateCte, exactMatchCte],
  };
}

/**
 * Whether the entity comes from one table, without extra CTI fields or preload JSON aggregates.
 *
 * Candidates store that table's row in _entity and later expand it back into entity columns.
 * Fields selected from other CTI tables or added by plugins/preloading would be lost in that expansion.
 */
function canSelectCandidateEntities(query: ParsedFindQuery, primaryAlias: string): boolean {
  // Joined projections (CTI/plugins), row-multiplying joins, and preload JSON need their own row mapping.
  return (
    query.selects.length === 1 &&
    query.selects[0] === `${kq(primaryAlias)}.*` &&
    query.tables.every(canSelectWithoutMultiplyingParents)
  );
}

/**
 * Whether joining this table returns at most one row per entity being found.
 *
 * Joining an author to its publisher cannot duplicate the author, but joining it to three books can.
 * Collection filters normally use EXISTS to avoid this; remaining collection joins can require DISTINCT
 * to return each entity once. Candidate batching omits DISTINCT, so it accepts only joins known not to
 * duplicate the entity.
 */
function canSelectWithoutMultiplyingParents(table: ParsedFindQuery["tables"][number]): boolean {
  if (table.join === "primary") return true;

  // Lateral and cross joins do not provide the cardinality guarantees used here.
  if (table.join !== "inner" && table.join !== "outer") return false;

  // Explicit cardinality metadata or a to-one id join guarantees at most one joined row.
  return table.distinct === false || (!table.collection && table.col2 === kqDot(table.alias, "id"));
}

/**
 * Encodes per-call filter arguments as columns of _find and records which filter uses each column.
 *
 * The binding positions must follow collectValues' visit order. Unsupported array encodings return
 * undefined so the caller can use regular batching instead of changing the filter's meaning.
 */
function buildFindArguments(
  query: ParsedFindQuery,
  entries: readonly FindEntry[],
  constantBindings: readonly boolean[],
): FindArguments | undefined {
  const columns: OpColumn[] = [{ columnName: "tag", dbType: "int" }];
  const values: unknown[][] = [entries.map((_, i) => i)];
  const filters = new Map<ColumnCondition, BatchFilterArgs>();
  let unsupported = false;

  for (const arg of collectFindArguments(query, constantBindings, { arrayEquality: true })) {
    const c = arg.condition;
    const start = arg.bindingIndexes[0];

    // Array-valued arguments need an encoding that preserves null elements and ragged dimensions.
    // The existing rectangular _find encoding cannot represent those without losing information.
    if (c.dbType.endsWith("[]")) unsupported = true;
    const columnNames = arg.columns.map((column) => column.columnName);
    for (let slot = 0; slot < arg.bindingIndexes.length; slot++) {
      const i = arg.bindingIndexes[slot];
      const membership = c.cond.kind === "eq" || c.cond.kind === "in" || c.cond.kind === "nin";
      const slotValues = entries.map((entry) => (c.cond.kind === "eq" ? [entry.bindings[i]] : entry.bindings[i]));
      // unnest_arrays strips padding NULLs, which would change NOT IN's three-valued logic.
      if (membership && slotValues.some((v) => Array.isArray(v) && v.some((item) => item == null))) unsupported = true;
      columns.push(arg.columns[slot]);
      values.push(slotValues);
    }

    // eq/in combine values into a list; numeric ranges use broad bounds. Other operators
    // impose no candidate restriction and are checked only during the exact-match phase.
    let allValues: unknown[] | undefined;
    let range: ParsedValueFilter<number> | undefined;
    const kind = c.cond.kind;
    if (kind === "eq") {
      allValues = [...new Set(entries.map((entry) => entry.bindings[start]))];
    } else if (kind === "in") {
      allValues = [...new Set(entries.flatMap((entry) => entry.bindings[start] as unknown[]))];
    } else if (
      numericDbTypes.has(c.dbType) &&
      (kind === "gt" || kind === "gte" || kind === "lt" || kind === "lte" || kind === "between")
    ) {
      // Other database types can use ordering that differs from JavaScript numeric comparison.
      range = broadenNumericRange(kind, entries, start);
    }
    filters.set(c, { columnNames, allValues, range });
  }
  if (unsupported || filters.size === 0) return;

  return {
    cte: { ...buildUnnestCte("_find", columns, values), materialized: true },
    filters,
  };
}

const numericDbTypes = new Set<string>([
  "smallint",
  "integer",
  "int",
  "int2",
  "int4",
  "int8",
  "bigint",
  "numeric",
  "decimal",
  "real",
  "float4",
  "float8",
  "double precision",
]);

/**
 * Combines finite numeric bounds without applying JavaScript ordering to PostgreSQL strings or custom types.
 *
 * I.e. age >= 30 / age >= 40 becomes age >= 30. Numeric strings, timestamps, and other encoded values
 * are checked in the exact-match phase; converting them here could lose precision or change PostgreSQL's ordering.
 */
function broadenNumericRange(
  kind: "gt" | "gte" | "lt" | "lte" | "between",
  entries: readonly FindEntry[],
  start: number,
): ParsedValueFilter<number> | undefined {
  const bounds = entries.map((entry) => entry.bindings[start]);
  const upperBounds = kind === "between" ? entries.map((entry) => entry.bindings[start + 1]) : [];

  // Encoded numeric strings and non-finite values cannot safely use these JavaScript comparisons.
  if (!bounds.every(isFiniteNumber) || !upperBounds.every(isFiniteNumber)) return;

  if (kind === "between") {
    const lowestLowerBound = bounds.reduce((a, b) => Math.min(a, b));
    const highestUpperBound = upperBounds.reduce((a, b) => Math.max(a, b));
    return { kind, value: [lowestLowerBound, highestUpperBound] };
  }

  const value =
    kind === "gt" || kind === "gte" ? bounds.reduce((a, b) => Math.min(a, b)) : bounds.reduce((a, b) => Math.max(a, b));
  return { kind, value };
}

/** Whether a binding can be ordered numerically without decoding or coercion. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Selects a superset of the requested rows without repeating the complete filter for every call.
 *
 * Each column condition accepts the values from any call, while AND/OR and positive EXISTS retain
 * their structure. I.e. `(title=one, order=1)` / `(title=two, order=2)` selects candidates using
 * `title IN [one, two] AND order IN [1, 2]`. The exact-match phase rejects cross-combinations afterward.
 * The number of calls changes bound arrays, not the candidate SQL text.
 */
function buildCandidateCondition(
  condition: ParsedExpressionFilter,
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>,
): ParsedExpressionFilter {
  return {
    ...condition,
    conditions: condition.conditions.map((c) => broadenCandidateCondition(c, perCallFilters)),
  };
}

/** Widens one condition without losing any row that could match an individual call. */
function broadenCandidateCondition(
  c: ParsedExpressionCondition,
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>,
): ParsedExpressionCondition {
  if (c.kind === "exp") return buildCandidateCondition(c, perCallFilters);
  if (c.kind === "column") {
    const arg = perCallFilters.get(c);
    if (!arg) return c;
    if (c.cond.kind === "eq" || c.cond.kind === "in") {
      return { ...c, cond: { kind: "in", value: arg.allValues! } };
    }
    if (arg.range) return { ...c, cond: arg.range };
    // Do not make the candidate phase depend on _find. NOT IN cannot use a union of exclusions,
    // and text/custom-type comparisons depend on PostgreSQL semantics. The exact-match phase handles these.
    return { kind: "raw", condition: "TRUE", aliases: [], bindings: [], pruneable: false };
  }
  if (c.kind === "exists" && c.subquery.condition && hasVaryingCondition(c, perCallFilters)) {
    // Widening the inside of NOT EXISTS would narrow the outside and lose valid candidates.
    // Leave this entire restriction to the exact-match phase; shared NOT EXISTS restrictions stay unchanged.
    if (c.negate) return { kind: "raw", condition: "TRUE", aliases: [], bindings: [], pruneable: false };
    return {
      ...c,
      subquery: { ...c.subquery, condition: buildCandidateCondition(c.subquery.condition, perCallFilters) },
    };
  }
  return c;
}

/** Builds the SELECT expressions and exact-match SQL for one level of the batch's nested filters. */
function buildBatchLevel(
  query: ParsedFindQuery,
  condition: ParsedExpressionFilter,
  alias: string,
  context: ExactMatchContext,
  parentLevel?: BatchLevel,
): BatchLevel {
  const tables = new Map(parentLevel?.tables);
  for (const table of query.tables) tables.set(table.alias, table.table);
  const level: BatchLevel = {
    alias,
    select: [],
    exactMatchSql: "",
    tables,
    nested: parentLevel !== undefined,
  };
  level.exactMatchSql = buildExactMatchCondition(condition, level, context);
  return level;
}

/**
 * Preserves boolean and EXISTS structure while replacing database lookups with projected row values.
 *
 * An EXISTS projection contains records, not independent column arrays: `_r0._c0` and `_r0._c1`
 * come from the same child. A nested EXISTS becomes a record-array field on that particular child.
 */
function buildExactMatchCondition(c: ParsedExpressionCondition, level: BatchLevel, context: ExactMatchContext): string {
  if (c.kind === "exp") {
    return `(${c.conditions.map((child) => buildExactMatchCondition(child, level, context)).join(` ${c.op.toUpperCase()} `)})`;
  }
  const name = `_c${level.select.length}`;
  const reference = kqDot(level.alias, name);
  const arg = c.kind === "column" ? context.perCallFilters.get(c) : undefined;
  if (c.kind === "column" && arg) {
    if (level.nested) {
      // An anonymous record's `text` field loses a column-specific collation when unnested.
      // A native table row retains attribute types AND collations, and is projected once per source alias.
      let source = level.select.find((v) => v.sourceAlias === c.alias);
      if (!source) {
        source = { name, dbType: kq(level.tables.get(c.alias)!), sql: kq(c.alias), bindings: [], sourceAlias: c.alias };
        level.select.push(source);
      }
      return renderExactMatch(c, `(${kqDot(level.alias, source.name)}).${kq(c.column)}`, arg);
    }
    level.select.push({ name, dbType: c.dbType, sql: kqDot(c.alias, c.column), bindings: [] });
    return renderExactMatch(c, reference, arg);
  }
  if (c.kind === "exists" && hasVaryingCondition(c, context.perCallFilters)) {
    const childCondition = conditionsForExactMatch(c.subquery.condition!, context.perCallFilters);
    const childWhere = sharedConditionsForCandidate(c.subquery.condition!, context.perCallFilters);
    // A joined child may have several matching rows. Deduplicating its id before the exact-match phase would
    // discard other joined values; EXISTS only needs one match, so duplicate child records are harmless.
    const tables = withoutDistinct(c.subquery.tables);
    const scalar = singleMembership(childCondition, context.perCallFilters);
    if (scalar && !c.negate && !level.nested) {
      // A single membership predicate needs only one scalar array, not a record array + unnest.
      // Only use it on the candidate itself: an array inside an anonymous record would lose its
      // column collation on unnest. Nested levels use native table rows to preserve that metadata.
      // Every call's requested values are a subset of allValues, so other child values cannot
      // affect overlap. Keep shared restrictions while trimming the materialized array.
      const requestedChildWhere: ParsedExpressionFilter = {
        kind: "exp",
        op: "and",
        conditions: [childWhere, broadenCandidateCondition(scalar, context.perCallFilters)],
      };
      const child = buildRawQuery(
        {
          ...c.subquery,
          tables,
          selects: [kqDot(scalar.alias, scalar.column)],
          condition: requestedChildWhere,
          orderBys: [],
        },
        {},
      );
      level.select.push({
        name,
        dbType: `${scalar.dbType}[]`,
        sql: `ARRAY(${child.sql})`,
        bindings: [...child.bindings],
      });
      return `${reference} && _find.${context.perCallFilters.get(scalar)!.columnNames[0]}`;
    }
    const childLevel = buildBatchLevel(c.subquery, childCondition, `_r${context.nextAlias++}`, context, level);
    const childRows = buildRawQuery(
      {
        ...c.subquery,
        tables,
        selects: [
          {
            sql: `ROW(${childLevel.select.map((v) => v.sql).join(", ")})`,
            bindings: childLevel.select.flatMap((v) => v.bindings),
            aliases: c.outerAliases,
          },
        ],
        condition: childWhere,
        orderBys: [],
      },
      {},
    );
    level.select.push({
      name,
      dbType: "record[]",
      sql: `ARRAY(${childRows.sql})`,
      bindings: [...childRows.bindings],
    });
    const columns = childLevel.select.map((v) => `${v.name} ${v.dbType}`).join(", ");
    return `${c.negate ? "NOT " : ""}EXISTS (SELECT 1 FROM unnest(${reference}) AS ${childLevel.alias}(${columns}) WHERE ${childLevel.exactMatchSql})`;
  }
  // Shared predicates below OR must still be checked for each entry. Project the database's boolean
  // result once, preserving NULL semantics and avoiding JS evaluation of types, timestamps, or operators.
  const [sql, bindings] = buildWhereClause({ kind: "exp", op: "and", conditions: [c] }, true, (q) =>
    buildRawQuery(q, {}),
  )!;
  level.select.push({ name, dbType: "boolean", sql: `(${sql})`, bindings });
  return reference;
}

/**
 * Renders an exact-match phase comparison against candidate values and typed _find argument columns.
 *
 * I.e. an age BETWEEN filter with reference = "a._c0" and columnNames = ["arg0", "arg1"]
 * becomes `a._c0 BETWEEN _find.arg0 AND _find.arg1`: the candidate's age is compared with each call's bounds.
 */
function renderExactMatch(c: ColumnCondition, reference: string, arg: BatchFilterArgs): string {
  if (c.cond.kind === "eq" || c.cond.kind === "in") return `${reference} = ANY(_find.${arg.columnNames[0]})`;
  const [sql] = buildValueCondition(reference, c.cond);
  let index = 0;
  // This is renderer-generated SQL, not user raw SQL. Replace its placeholders (including ALL(?)),
  // leaving the '?' in PostgreSQL's JSON-path operator '@?' intact.
  return sql.replace(/(?<!@)\?/g, () => `_find.${arg.columnNames[index++]}`);
}

/** Finds the scalar-array overlap case after shared AND filters have been moved to the candidate phase. */
function singleMembership(
  c: ParsedExpressionCondition,
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>,
): ColumnCondition | undefined {
  if (c.kind === "exp" && c.conditions.length === 1) return singleMembership(c.conditions[0], perCallFilters);
  return c.kind === "column" && perCallFilters.has(c) && (c.cond.kind === "eq" || c.cond.kind === "in") ? c : undefined;
}

/**
 * Keeps conditions that still need checking after the candidate phase has applied shared filters.
 *
 * The phases split conditions only at AND: if all calls require `age > 20 AND title = theirTitle`,
 * the candidate phase guarantees age > 20, so the exact-match phase needs only the title.
 * For `age > 20 OR title = theirTitle`, the candidate phase does not guarantee either branch
 * for a particular call, so the exact-match phase keeps the whole OR.
 * `sharedConditionsForCandidate` supplies the complementary restrictions when collecting child rows.
 */
function conditionsForExactMatch(
  c: ParsedExpressionFilter,
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>,
): ParsedExpressionFilter {
  if (c.op !== "and") return c;
  return {
    ...c,
    conditions: c.conditions
      .filter((child) => hasVaryingCondition(child, perCallFilters))
      .map((child) => (child.kind === "exp" ? conditionsForExactMatch(child, perCallFilters) : child)),
  };
}

/**
 * Keeps shared AND restrictions for the candidate phase when collecting child rows.
 *
 * I.e. calls requesting `book.order = 1 AND book.title = "one"` / `book.order = 1 AND book.title = "two"`
 * can collect only books with order = 1. The exact-match phase then checks each call's title.
 *
 * For `book.order = 1 OR book.title = "one"` / `book.order = 1 OR book.title = "two"`, collecting only
 * books with order = 1 would lose books accepted by the title branch. This helper therefore keeps no
 * restriction from that OR; the exact-match phase checks the entire OR for each call.
 */
function sharedConditionsForCandidate(
  c: ParsedExpressionFilter,
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>,
): ParsedExpressionFilter {
  if (!hasVaryingCondition(c, perCallFilters)) return c;
  return {
    kind: "exp",
    op: "and",
    conditions:
      c.op === "or"
        ? []
        : c.conditions.flatMap((child) => {
            if (!hasVaryingCondition(child, perCallFilters)) return [child];
            return child.kind === "exp" ? [sharedConditionsForCandidate(child, perCallFilters)] : [];
          }),
  };
}

/** Whether this condition uses filter values that differ between batched em.find calls, including inside nested EXISTS. */
function hasVaryingCondition(
  c: ParsedExpressionCondition,
  perCallFilters: Map<ColumnCondition, BatchFilterArgs>,
): boolean {
  if (c.kind === "column") return perCallFilters.has(c);
  if (c.kind === "exp") return c.conditions.some((child) => hasVaryingCondition(child, perCallFilters));
  return c.kind === "exists" && !!c.subquery.condition && hasVaryingCondition(c.subquery.condition, perCallFilters);
}

/** Whether the candidate phase includes a collection lookup, including a no-children check. */
function hasCollectionCondition(c: ParsedExpressionCondition): boolean {
  return c.kind === "exists" || (c.kind === "exp" && c.conditions.some(hasCollectionCondition));
}

/** Suppresses the renderer's automatic DISTINCT for root to-one joins or EXISTS child-record arrays. */
function withoutDistinct(tables: ParsedFindQuery["tables"]): ParsedFindQuery["tables"] {
  return tables.map((t) => (t.join === "inner" || t.join === "outer" ? { ...t, distinct: false } : t));
}

/** Raw SQL may be volatile; only plain column correlations are safe to evaluate in a projection. */
function canProjectCondition(c: ParsedExpressionCondition): boolean {
  if (c.kind === "exp") return c.conditions.length > 0 && c.conditions.every(canProjectCondition);
  if (c.kind === "raw") return c.bindings.length === 0 && /^[\w".]+ = [\w".]+$/.test(c.condition);
  if (c.kind === "exists")
    return (
      !c.subquery.ctes?.length &&
      !c.subquery.groupBys?.length &&
      c.subquery.tables.every((t) => t.join !== "lateral" && t.join !== "cross") &&
      !!c.subquery.condition &&
      canProjectCondition(c.subquery.condition)
    );
  return true;
}
