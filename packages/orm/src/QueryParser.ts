import { isPlainObject } from "is-plain-object";
import { groupBy } from "joist-utils";
import { aliasMgmt, isAlias } from "./Aliases";
import { Entity, isEntity } from "./Entity";
import { ExpressionFilter, OrderBy, ValueFilter } from "./EntityFilter";
import { EntityMetadata } from "./EntityMetadata";
import {
  Column,
  getConstructorFromTaggedId,
  isDefined,
  keyToNumber,
  maybeResolveReferenceToId,
  needsClassPerTableJoins,
} from "./index";
import { abbreviation } from "./QueryBuilder";
import { assertNever, fail, partition } from "./utils";

export interface ParsedExpressionFilter {
  op: "and" | "or";
  conditions: (ParsedExpressionFilter | ColumnCondition)[];
}

export interface ColumnCondition {
  alias: string;
  column: string;
  dbType: string;
  cond: ParsedValueFilter<any>;
  pruneable?: boolean;
}

/** A marker condition for alias methods to indicate they should be skipped/pruned. */
export const skipCondition: ColumnCondition = {
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

export type ParsedTable = PrimaryTable | JoinTable;

interface ParsedOrderBy {
  alias: string;
  column: string;
  order: OrderBy;
}

/** The result of parsing an `em.find` filter. */
export interface ParsedFindQuery {
  selects: string[];
  /** The primary table plus any joins. */
  tables: ParsedTable[];
  /** Simple conditions that are ANDd together. */
  conditions: ColumnCondition[];
  /** Any optional complex conditions that will be ANDd with the simple conditions. */
  complexConditions?: ParsedExpressionFilter[];
  /** Any optional orders to add before the default 'order by id'. */
  orderBys?: ParsedOrderBy[];
}

/** Parses an `em.find` filter into a `ParsedFindQuery` for simpler execution. */
export function parseFindQuery(
  meta: EntityMetadata<any>,
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
  const conditions: ColumnCondition[] = [];
  const query = { selects, tables, conditions };
  const complexConditions: ParsedExpressionFilter[] = [];
  const orderBys: ParsedOrderBy[] = [];
  const {
    orderBy = undefined,
    conditions: expression = undefined,
    softDeletes = "exclude",
    pruneJoins = true,
    keepAliases = [],
  } = opts;

  const aliases: Record<string, number> = {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  function filterSoftDeletes(meta: EntityMetadata<any>): boolean {
    return softDeletes === "exclude" && !!meta.timestampFields.deletedAt;
  }

  function maybeAddNotSoftDeleted(meta: EntityMetadata<any>, alias: string): void {
    if (filterSoftDeletes(meta)) {
      const column = meta.allFields[meta.timestampFields.deletedAt!].serde?.columns[0]!;
      conditions.push({
        alias,
        column: column.columnName,
        dbType: column.dbType,
        cond: { kind: "is-null" },
        pruneable: true,
      });
    }
  }

  function addTable(
    meta: EntityMetadata<any>,
    alias: string,
    join: ParsedTable["join"],
    col1: string,
    col2: string,
    filter: any,
  ): void {
    // look at filter, is it `{ book: "b2" }` or `{ book: { ... } }`
    const ef = parseEntityFilter(filter);
    if (!ef && join !== "primary" && !isAlias(filter)) {
      return;
    }

    if (join === "primary") {
      tables.push({ alias, table: meta.tableName, join });
    } else {
      tables.push({ alias, table: meta.tableName, join, col1, col2 });
    }

    // Maybe only do this if we're the primary, or have a field that needs it?
    if (needsClassPerTableJoins(meta)) {
      addTablePerClassJoinsAndClassTag(query, meta, alias, join === "primary");
    }

    maybeAddNotSoftDeleted(meta, alias);

    // The user's locally declared aliases, i.e. `const [a, b] = aliases(Author, Book)`,
    // aren't guaranteed to line up with the aliases we've assigned internally, like `a`
    // might actually be `a1` if there are two `authors` tables in the query, so push the
    // canonical alias value for the current clause into the Alias.
    if (filter && typeof filter === "object" && "as" in filter && isAlias(filter.as)) {
      filter.as[aliasMgmt].setAlias(alias);
    } else if (isAlias(filter)) {
      filter[aliasMgmt].setAlias(alias);
    }

    if (ef && ef.kind === "join") {
      // subFilter really means we're matching against the entity columns/further joins
      Object.keys(ef.subFilter).forEach((key) => {
        // Skip the `{ as: ... }` alias binding
        if (key === "as") return;
        const field = meta.allFields[key] ?? fail(`${key} not found on ${meta.tableName}`);
        if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
          const column = field.serde.columns[0];
          parseValueFilter((ef.subFilter as any)[key]).forEach((filter) => {
            conditions.push({
              alias: `${alias}${field.aliasSuffix}`,
              column: column.columnName,
              dbType: column.dbType,
              cond: mapToDb(column, filter),
            });
          });
        } else if (field.kind === "m2o") {
          const column = field.serde.columns[0];
          const sub = (ef.subFilter as any)[key];
          if (isAlias(sub)) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(field.otherMetadata(), a, "inner", `${alias}.${column.columnName}`, `${a}.id`, sub);
          }
          const f = parseEntityFilter(sub);
          // Probe the filter and see if it's just an id (...and not soft deleted), if so we can avoid the join
          if (!f) {
            // skip
          } else if (f.kind === "join" || filterSoftDeletes(field.otherMetadata())) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(field.otherMetadata(), a, "inner", `${alias}.${column.columnName}`, `${a}.id`, sub);
          } else {
            conditions.push({
              alias,
              column: column.columnName,
              dbType: column.dbType,
              cond: mapToDb(column, f),
            });
          }
        } else if (field.kind === "poly") {
          const f = parseEntityFilter((ef.subFilter as any)[key]);
          if (!f) {
            // skip
          } else if (f.kind === "join") {
            throw new Error("Joins through polys are not supported");
          } else {
            // We're left with basically a ValueFilter against the ids
            // For now only support eq/ne/in/is-null
            if (f.kind === "eq" || f.kind === "ne") {
              const comp =
                field.components.find(
                  (p) => p.otherMetadata().cstr === getConstructorFromTaggedId(f.value as string),
                ) || fail(`Could not find component for ${f.value}`);
              const column = field.serde.columns.find((c) => c.columnName === comp.columnName)!;
              conditions.push({
                alias,
                column: comp.columnName,
                dbType: column.dbType,
                cond: mapToDb(column, f),
              });
            } else if (f.kind === "is-null") {
              // Add a condition for every component
              // TODO ...should these be anded or ored?
              field.components.forEach((comp) => {
                const column = field.serde.columns.find((c) => c.columnName === comp.columnName)!;
                conditions.push({
                  alias,
                  column: comp.columnName,
                  dbType: column.dbType,
                  cond: f,
                });
              });
            } else if (f.kind === "in") {
              // Split up the ids by constructor
              const idsByConstructor = groupBy(f.value, (id) => getConstructorFromTaggedId(id as string).name);
              // Or together `parent_book_id in (1,2,3) OR parent_author_id IN (4,5,6)`
              const conditions = Object.entries(idsByConstructor).map(([cstrName, ids]) => {
                const column = field.serde.columns.find((c) => c.otherMetadata().cstr.name === cstrName)!;
                return {
                  alias,
                  column: column.columnName,
                  dbType: column.dbType,
                  cond: mapToDb(column, { kind: "in", value: ids }),
                };
              });
              complexConditions.push({ op: "or", conditions });
            } else {
              throw new Error(`Filters on polys for ${f.kind} are not supported`);
            }
          }
        } else if (field.kind === "o2o") {
          // We have to always join into o2os, i.e. we can't probe the filter like we do for m2os
          const a = getAlias(field.otherMetadata().tableName);
          const otherColumn = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
          addTable(field.otherMetadata(), a, "outer", `${alias}.id`, `${a}.${otherColumn}`, (ef.subFilter as any)[key]);
        } else if (field.kind === "o2m") {
          const a = getAlias(field.otherMetadata().tableName);
          const otherColumn = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
          addTable(field.otherMetadata(), a, "outer", `${alias}.id`, `${a}.${otherColumn}`, (ef.subFilter as any)[key]);
        } else if (field.kind === "m2m") {
          // Always join into the m2m table
          const ja = getAlias(field.joinTableName);
          tables.push({
            alias: ja,
            join: "outer",
            table: field.joinTableName,
            col1: `${alias}.id`,
            col2: `${ja}.${field.columnNames[0]}`,
          });
          // But conditionally join into the alias table
          const sub = (ef.subFilter as any)[key];
          if (isAlias(sub)) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(field.otherMetadata(), a, "outer", `${ja}.${field.columnNames[1]}`, `${a}.id`, sub);
          }
          const f = parseEntityFilter(sub);
          // Probe the filter and see if it's just an id, if so we can avoid the join
          if (!f) {
            // skip
          } else if (f.kind === "join" || filterSoftDeletes(field.otherMetadata())) {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(
              field.otherMetadata(),
              a,
              "outer",
              `${ja}.${field.columnNames[1]}`,
              `${a}.id`,
              (ef.subFilter as any)[key],
            );
          } else {
            const meta = field.otherMetadata();
            const column: any = {
              mapToDb(value: any) {
                return value === null ? value : keyToNumber(meta, maybeResolveReferenceToId(value));
              },
            };
            conditions.push({
              alias: ja,
              column: field.columnNames[1],
              dbType: meta.idType,
              cond: mapToDb(column, f),
            });
          }
        } else {
          throw new Error(`Unsupported field ${key}`);
        }
      });
    } else if (ef) {
      const column = meta.fields["id"].serde!.columns[0];
      conditions.push({ alias, column: "id", dbType: meta.idType, cond: mapToDb(column, ef) });
    }
  }

  function addOrderBy(meta: EntityMetadata<any>, alias: string, orderBy: any): void {
    // Assume only one key
    const entries = Object.entries(orderBy);
    if (entries.length === 0) {
      return;
    }
    Object.entries(orderBy).forEach(([key, value]) => {
      const field = meta.allFields[key] ?? fail(`${key} not found on ${meta.tableName}`);
      if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
        const column = field.serde.columns[0];
        orderBys.push({ alias, column: column.columnName, order: value as OrderBy });
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
          tables.push({ alias: a, table, join: "outer", col1: `${alias}.${column}`, col2: `${a}.id`, distinct: false });
          addOrderBy(field.otherMetadata(), a, value);
        }
      } else {
        throw new Error(`Unsupported field ${key}`);
      }
    });
  }

  // always add the main table
  const alias = getAlias(meta.tableName);
  selects.push(`"${alias}".*`);
  addTable(meta, alias, "primary", "n/a", "n/a", filter);
  if (expression) {
    const parsed = parseExpression(expression);
    if (parsed) {
      complexConditions.push(parsed);
    }
  }
  if (orderBy) {
    addOrderBy(meta, alias, orderBy);
  } else {
    maybeAddOrderBy(query, meta, alias);
  }

  if (orderBys.length > 0) {
    Object.assign(query, { orderBys });
  }
  if (complexConditions.length > 0) {
    Object.assign(query, { complexConditions });
  }
  if (pruneJoins) {
    pruneUnusedJoins(query, keepAliases);
  }
  return query;
}

// Remove any joins that are not used in the select or conditions
function pruneUnusedJoins(parsed: ParsedFindQuery, keepAliases: string[]): void {
  // Mark all terminal usages
  const used = new Set<string>();
  parsed.selects.forEach((s) => used.add(parseAlias(s)));
  parsed.conditions.filter((c) => !c.pruneable).forEach((c) => used.add(c.alias));
  parsed.orderBys?.forEach((o) => used.add(o.alias));
  keepAliases.forEach((a) => used.add(a));
  flattenComplexConditions(parsed.complexConditions).forEach((c) => used.add(c.alias));
  // Mark all usages via joins
  for (let i = 0; i < parsed.tables.length; i++) {
    const t = parsed.tables[i];
    if (t.join !== "primary") {
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
  // And then remove any soft-delete conditions we don't need anymore
  parsed.conditions = parsed.conditions.filter((c) => {
    const prune = c.pruneable && !parsed.tables.some((t) => t.alias === c.alias);
    return !prune;
  });
}

function flattenComplexConditions(conditions: ParsedExpressionFilter[] | undefined): ColumnCondition[] {
  const todo = conditions ? [...conditions] : [];
  const result: ColumnCondition[] = [];
  while (todo.length !== 0) {
    const cc = todo.pop()!;
    for (const c of cc.conditions) {
      if ("op" in c) {
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
export function parseEntityFilter(filter: any): ParsedEntityFilter | undefined {
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
  } else if (Array.isArray(filter)) {
    return {
      kind: "in",
      value: filter.map((v: string | number | Entity) => {
        return isEntity(v) ? v.id ?? -1 : v;
      }),
    };
  } else if (isEntity(filter)) {
    return { kind: "eq", value: filter.id || -1 };
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
        return { kind: "ne", value: value.id || -1 };
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
        return { kind: "eq", value: value.id || -1 };
      } else {
        return parseValueFilter(value)[0] as any;
      }
    }
    return { kind: "join", subFilter: filter };
  } else {
    throw new Error(`Unrecognized filter ${filter}`);
  }
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
  | { kind: "ilike"; value: V }
  | { kind: "contains"; value: readonly V[] }
  | { kind: "overlaps"; value: readonly V[] }
  | { kind: "containedBy"; value: readonly V[] }
  | { kind: "between"; value: [V, V] };

/**
 * Parses the many/hodgepdoge (ergonomic!) patterns of value filters into a `ParsedValueFilter`.
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
            case "ilike":
            case "contains":
            case "overlaps":
            case "containedBy":
              return { kind: key, value: filter[key] };
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
  switch (filter.kind) {
    case "eq":
    case "gt":
    case "gte":
    case "ne":
    case "lt":
    case "lte":
    case "like":
    case "ilike":
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
    case "overlaps":
    case "containedBy":
      if (!column.isArray) {
        throw new Error(`${filter.kind} is only unsupported on array columns`);
      }
      filter.value = column.mapToDb(filter.value);
      return filter;
    case "between":
      filter.value[0] = column.mapToDb(filter.value[0]);
      filter.value[1] = column.mapToDb(filter.value[1]);
      return filter;
    case "is-null":
    case "not-null":
      return filter;
    default:
      throw assertNever(filter);
  }
}

export function maybeAddOrderBy(query: ParsedFindQuery, meta: EntityMetadata<any>, alias: string): void {
  if (meta.orderBy) {
    const field = meta.allFields[meta.orderBy] ?? fail(`${meta.orderBy} not found on ${meta.tableName}`);
    query.orderBys ??= [];
    query.orderBys.push({ alias, column: field.serde!.columns[0].columnName, order: "ASC" });
  }
}

export function addTablePerClassJoinsAndClassTag(
  query: ParsedFindQuery,
  meta: EntityMetadata<any>,
  alias: string,
  isPrimary: boolean,
): void {
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
      col1: `${alias}.id`,
      col2: `${alias}_b${i}.id`,
      distinct: false,
    });
  });

  // We always join in the base table in case a query happens to use
  // it as a filter, but we only need to do the subtype joins + selects
  // if this is the primary table
  if (isPrimary) {
    // When `.load(Publisher)` is called, join in sub tables like `SmallPublisher` and `LargePublisher`
    meta.subTypes.forEach((st, i) => {
      selects.push(`${alias}_s${i}.*`);
      tables.push({
        alias: `${alias}_s${i}`,
        table: st.tableName,
        join: "outer",
        col1: `${alias}.id`,
        col2: `${alias}_s${i}.id`,
        distinct: false,
      });
    });

    // Nominate a specific `id` column to avoid ambiguity
    selects.push(`"${alias}".id as id`);

    // If our meta has no subtypes, we're a left type and don't need a __class
    const cases = meta.subTypes.map((st, i) => `WHEN ${alias}_s${i}.id IS NOT NULL THEN '${st.type}'`);
    if (cases.length > 0) {
      selects.push(`CASE ${cases.join(" ")} ELSE '${meta.type}' END as __class`);
    }
  }
}

export function maybeAddNotSoftDeleted(
  conditions: ColumnCondition[],
  meta: EntityMetadata<any>,
  alias: string,
  softDeletes: "include" | "exclude",
): void {
  if (softDeletes === "exclude" && meta.timestampFields.deletedAt) {
    const column = meta.allFields[meta.timestampFields.deletedAt].serde?.columns[0]!;
    conditions.push({
      alias,
      column: column.columnName,
      dbType: column.dbType,
      cond: { kind: "is-null" },
    });
  }
}

function parseExpression(expression: ExpressionFilter): ParsedExpressionFilter | undefined {
  const [op, expressions] =
    "and" in expression
      ? ["and" as const, expression.and]
      : "or" in expression
      ? ["or" as const, expression.or]
      : fail(`Invalid expression ${expression}`);
  const conditions = expressions.map((exp) => (exp && ("and" in exp || "or" in exp) ? parseExpression(exp) : exp));
  const [skip, valid] = partition(conditions, (cond) => cond === undefined || cond === skipCondition);
  if ((skip.length > 0 && expression.pruneIfUndefined === "any") || valid.length === 0) {
    return undefined;
  }
  return { op, conditions: valid.filter(isDefined) };
}

/**
 * Combines the simple & complex compressions of `query` into a single `ParsedExpressionFilter`.
 *
 * The two `query.conditions` and `query.complexConditions` separated generally for historical
 * reasons in the `parseFindQuery` implementation, but are effectively a single expression of
 * `AND`-ing the conditions with the complex conditions.
 */
export function combineConditions(query: ParsedFindQuery): ParsedExpressionFilter {
  if (query.complexConditions) {
    return { op: "and", conditions: [...query.conditions, ...query.complexConditions] };
  } else {
    return { op: "and", conditions: query.conditions };
  }
}

export function getTables(query: ParsedFindQuery): [PrimaryTable, JoinTable[], JoinTable[]] {
  let primary: PrimaryTable;
  const innerJoins: JoinTable[] = [];
  const outerJoins: JoinTable[] = [];
  for (const table of query.tables) {
    if (table.join === "primary") {
      primary = table;
    } else if (table.join === "inner") {
      innerJoins.push(table);
    } else if (table.join === "outer") {
      outerJoins.push(table);
    }
  }
  return [primary!, innerJoins, outerJoins];
}
