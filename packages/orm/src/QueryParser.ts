import { groupBy } from "joist-utils";
import { Entity, isEntity } from "./Entity";
import { OrderBy, ValueFilter } from "./EntityFilter";
import { EntityMetadata } from "./EntityMetadata";
import { Column, getConstructorFromTaggedId, needsClassPerTableJoins } from "./index";
import { abbreviation } from "./QueryBuilder";
import { assertNever, fail } from "./utils";

export interface ExpressionCondition {
  op: "and" | "or";
  conditions: (ExpressionCondition | ColumnCondition)[];
}

export interface ColumnCondition {
  alias: string;
  column: string;
  cond: ParsedValueFilter<any>;
}

interface PrimaryTable {
  join: "primary";
  alias: string;
  table: string;
}

interface JoinTable {
  join: "m2o" | "o2m" | "o2o" | "left";
  alias: string;
  table: string;
  col1: string;
  col2: string;
}

type ParsedTable = PrimaryTable | JoinTable;

interface ParsedOrderBy {
  alias: string;
  column: string;
  order: OrderBy;
}

/** The result of parsing an `em.find` filter. */
interface ParsedFindQuery {
  selects: string[];
  /** The primary table plus any joins. */
  tables: ParsedTable[];
  /** Simple conditions that are ANDd together. */
  conditions: ColumnCondition[];
  /** Any optional complex conditions that will be ANDd with the simple conditions. */
  complexConditions?: ExpressionCondition[];
  /** Any optional orders to add before the default 'order by id'. */
  orderBys?: ParsedOrderBy[];
}

/** Parses an `em.find` filter into a `ParsedFindQuery` for simpler execution. */
export function parseFindQuery(meta: EntityMetadata<any>, filter: any, orderBy: any = {}): ParsedFindQuery {
  const selects: string[] = [];
  const tables: ParsedTable[] = [];
  const conditions: ColumnCondition[] = [];
  const complexConditions: ExpressionCondition[] = [];
  const orderBys: ParsedOrderBy[] = [];

  const aliases: Record<string, number> = {};
  function getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = aliases[abbrev] || 0;
    aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
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
    if (ef.kind === "pass" && join !== "primary") {
      return;
    }

    if (join === "primary") {
      tables.push({ alias, table: meta.tableName, join });
    } else {
      tables.push({ alias, table: meta.tableName, join, col1, col2 });
    }

    // Maybe only do this if we're the primary, or have a field that needs it?
    if (needsClassPerTableJoins(meta)) {
      addTablePerClassJoinsAndClassTag(selects, tables, meta, alias, join === "primary");
    }

    if (ef.kind === "pass") {
      //
    } else if (ef.kind === "join") {
      // subFilter really means we're matching against the entity columns/further joins
      Object.keys(ef.subFilter).forEach((key) => {
        const field = meta.allFields[key] ?? fail(`${key} not found on ${meta.tableName}`);
        if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
          const filter = parseValueFilter((ef.subFilter as any)[key]);
          const column = field.serde.columns[0];
          if (filter.kind !== "pass") {
            conditions.push({
              alias: `${alias}${field.aliasSuffix}`,
              column: column.columnName,
              cond: mapToDb(column, filter),
            });
          }
        } else if (field.kind === "m2o") {
          // Probe the filter and see if it's just an id, if so we can avoid the join
          const f = parseEntityFilter((ef.subFilter as any)[key]);
          const column = field.serde.columns[0];
          if (f.kind === "pass") {
            // skip
          } else if (f.kind === "join") {
            const a = getAlias(field.otherMetadata().tableName);
            addTable(
              field.otherMetadata(),
              a,
              "m2o",
              `${alias}.${column.columnName}`,
              `${a}.id`,
              (ef.subFilter as any)[key],
            );
          } else {
            conditions.push({ alias, column: column.columnName, cond: mapToDb(column, f) });
          }
        } else if (field.kind === "poly") {
          const f = parseEntityFilter((ef.subFilter as any)[key]);
          if (f.kind === "pass") {
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
              conditions.push({ alias, column: comp.columnName, cond: mapToDb(column, f) });
            } else if (f.kind === "is-null") {
              // Add a condition for every component
              // TODO ...should these be anded or ored?
              field.components.forEach((comp) => {
                conditions.push({ alias, column: comp.columnName, cond: f });
              });
            } else if (f.kind === "in") {
              // Split up the ids by constructor
              const idsByConstructor = groupBy(f.value, (id) => getConstructorFromTaggedId(id as string).name);
              // Or together `parent_book_id in (1,2,3) OR parent_author_id IN (4,5,6)`
              const conditions = Object.entries(idsByConstructor).map(([cstrName, ids]) => {
                const column = field.serde.columns.find((c) => c.otherMetadata().cstr.name === cstrName)!;
                return { alias, column: column.columnName, cond: mapToDb(column, { kind: "in", value: ids }) };
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
          addTable(field.otherMetadata(), a, "o2o", `${alias}.id`, `${a}.${otherColumn}`, (ef.subFilter as any)[key]);
        } else if (field.kind === "o2m") {
          const a = getAlias(field.otherMetadata().tableName);
          const otherColumn = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
          addTable(field.otherMetadata(), a, "o2m", `${alias}.id`, `${a}.${otherColumn}`, (ef.subFilter as any)[key]);
        } else {
          throw new Error(`Unsupported field ${key}`);
        }
      });
    } else {
      const column = meta.fields["id"].serde!.columns[0];
      conditions.push({ alias, column: "id", cond: mapToDb(column, ef) });
    }
  }

  function addOrderBy(meta: EntityMetadata<any>, alias: string, orderBy: any): void {
    // Assume only one key
    const entries = Object.entries(orderBy);
    if (entries.length === 0) {
      return;
    }
    const [key, value] = entries[0];
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
        tables.push({ alias: a, table, join: "m2o", col1: `${alias}.${column}`, col2: `${a}.id` });
        addOrderBy(field.otherMetadata(), a, value);
      }
    } else {
      throw new Error(`Unsupported field ${key}`);
    }
  }

  // always add the main table
  const alias = getAlias(meta.tableName);
  selects.push(`${alias}.*`);
  addTable(meta, alias, "primary", "n/a", "n/a", filter);
  if (orderBy) {
    addOrderBy(meta, alias, orderBy);
  }

  const parsed = { selects, tables, conditions };
  if (orderBys.length > 0) {
    Object.assign(parsed, { orderBys });
  }
  if (complexConditions.length > 0) {
    Object.assign(parsed, { complexConditions });
  }
  return parsed;
}

/** An ADT version of `EntityFilter`. */
export type ParsedEntityFilter =
  // ParsedValueFilter is any simple match on `id`
  | ParsedValueFilter<string | number>
  // Otherwise we return the join/complex
  | { kind: "join"; subFilter: object };

/** Parses an entity filter, which could be "just an id", an array of ids, or a nested filter. */
export function parseEntityFilter(filter: any): ParsedEntityFilter {
  if (filter === undefined) {
    // This matches legacy `em.find({ author: undefined })` behavior
    return { kind: "pass" };
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
      if (value === null || value === undefined) {
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
      if (value === null || value === undefined) {
        return { kind: "is-null" };
      } else if (typeof value === "string" || typeof value === "number") {
        return { kind: "eq", value };
      } else if (isEntity(value)) {
        return { kind: "eq", value: value.id || -1 };
      } else {
        return parseValueFilter(value);
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
  | { kind: "in"; value: V[] }
  | { kind: "@>"; value: V[] }
  | { kind: "gt"; value: V }
  | { kind: "gte"; value: V }
  | { kind: "ne"; value: V }
  | { kind: "is-null" }
  | { kind: "not-null" }
  | { kind: "lt"; value: V }
  | { kind: "lte"; value: V }
  | { kind: "like"; value: V }
  | { kind: "ilike"; value: V }
  | { kind: "pass" }
  | { kind: "between"; value: [V, V] };

export function parseValueFilter<V>(filter: ValueFilter<V, any>): ParsedValueFilter<V> {
  if (filter === null) {
    return { kind: "is-null" };
  } else if (filter === undefined) {
    return { kind: "pass" };
  } else if (Array.isArray(filter)) {
    return { kind: "in", value: filter };
  } else if (typeof filter === "object") {
    const keys = Object.keys(filter);
    if (keys.length === 0) {
      return { kind: "pass" };
    } else if (keys.length === 1) {
      const key = keys[0];
      switch (key) {
        case "eq":
          if (filter[key] === null || filter[key] === undefined) {
            return { kind: "is-null" };
          } else {
            return { kind: "eq", value: filter[key] };
          }
        case "ne":
          if (filter[key] === null || filter[key] === undefined) {
            return { kind: "not-null" };
          } else {
            return { kind: "ne", value: filter[key] ?? null };
          }
        case "in":
          return { kind: "in", value: filter[key] };
        case "gt":
        case "gte":
        case "lt":
        case "lte":
        case "like":
        case "ilike":
          return { kind: key, value: filter[key] };
      }
    } else if (keys.length === 2 && "op" in filter && "value" in filter) {
      // Probe for `findGql` op & value
      const { op, value } = filter;
      if (value === null) {
        return { kind: "is-null" };
      } else {
        return { kind: op, value: value ?? null };
      }
    } else if (keys.length === 2 && "gte" in filter && "lte" in filter) {
      const { gte, lte } = filter;
      return { kind: "between", value: [gte, lte] };
    }
    throw new Error("unsupported value filter");
  } else {
    // This is a primitive like a string, number
    return { kind: "eq", value: filter };
  }
}

/** Converts domain-level values like string ids/enums into their db equivalent. */
function mapToDb(column: Column, filter: ParsedValueFilter<any>): ParsedValueFilter<any> {
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
    case "pass":
      return filter;
    case "@>":
    case "in":
      if (column.isArray) {
        // Arrays need a special operator
        return {
          kind: "@>",
          value: column.mapToDb(filter.value),
        };
      } else {
        filter.value = filter.value.map((v) => column.mapToDb(v));
      }
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

function addTablePerClassJoinsAndClassTag(
  selects: string[],
  tables: ParsedTable[],
  meta: EntityMetadata<any>,
  alias: string,
  isPrimary: boolean,
): void {
  // When `.load(SmallPublisher)` is called, join in base tables like `Publisher`
  meta.baseTypes.forEach((bt, i) => {
    if (isPrimary) {
      selects.push(`${alias}_b${i}.*`);
    }
    tables.push({
      alias: `${alias}_b${i}`,
      table: bt.tableName,
      join: "left",
      col1: `${alias}.id`,
      col2: `${alias}_b${i}.id`,
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
        join: "left",
        col1: `${alias}.id`,
        col2: `${alias}_s${i}.id`,
      });
    });

    // Nominate a specific `id` column to avoid ambiguity
    selects.push(`${alias}.id as id`);

    // If our meta has no subtypes, we're a left type and don't need a __class
    const cases = meta.subTypes.map((st, i) => `WHEN ${alias}_s${i}.id IS NOT NULL THEN '${st.type}'`);
    if (cases.length > 0) {
      selects.push(`CASE ${cases.join(" ")} ELSE '${meta.type}' END as __class`);
    }
  }
}
