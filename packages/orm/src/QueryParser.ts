import { Entity, isEntity } from "./Entity";
import { ValueFilter } from "./EntityFilter";
import { EntityMetadata } from "./EntityMetadata";
import { keyToNumber } from "./keys";
import { abbreviation } from "./QueryBuilder";
import { assertNever, fail } from "./utils";

// I want a list of joins (with aliases as appropriate)
// I want a list of conditions
// I want a list of order bys

interface ParsedCondition {
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
  join: "m2o" | "o2m" | "o2o";
  alias: string;
  table: string;
  col1: string;
  col2: string;
}

type ParsedTable = PrimaryTable | JoinTable;

interface ParsedFindQuery {
  tables: ParsedTable[];
  conditions: ParsedCondition[];
}

export function parseFindQuery(meta: EntityMetadata<any>, filter: any): ParsedFindQuery {
  const tables: ParsedTable[] = [];
  const conditions: ParsedCondition[] = [];

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
    const ef = parseEntityFilter(meta, filter);
    if (ef.kind === "pass" && join !== "primary") {
      return;
    }

    if (join === "primary") {
      tables.push({ alias, table: meta.tableName, join });
    } else {
      tables.push({ alias, table: meta.tableName, join, col1, col2 });
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
          applyDbFilter(filter, (v) => column.mapToDb(v));
          if (filter.kind !== "pass") {
            conditions.push({ alias, column: column.columnName, cond: filter });
          }
        } else if (field.kind === "m2o") {
          // Probe the filter and see if it's just an id, if so we can avoid the join
          const f = parseEntityFilter(field.otherMetadata(), (ef.subFilter as any)[key]);
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
            applyDbFilter(f, (v) => column.mapToDb(v));
            conditions.push({ alias, column: column.columnName, cond: f });
          }
        } else if (field.kind === "o2o") {
          const a = getAlias(field.otherMetadata().tableName);
          const otherColumn = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
          addTable(field.otherMetadata(), a, "o2o", `${alias}.id`, `${a}.${otherColumn}`, (ef.subFilter as any)[key]);
        } else {
          throw new Error(`Unsupported field ${key}`);
        }
      });
    } else {
      const column = meta.fields["id"].serde!.columns[0];
      applyDbFilter(ef, (v) => column.mapToDb(v));
      conditions.push({ alias, column: "id", cond: ef });
    }
  }

  // always add the main table
  const alias = getAlias(meta.tableName);
  addTable(meta, alias, "primary", "n/a", "n/a", filter);

  return { tables, conditions };
}

/** An ADT version of `EntityFilter`. */
export type ParsedEntityFilter =
  // ParsedValueFilter is any simple match on `id`
  | ParsedValueFilter<number>
  // Otherwise we return the join/complex
  | { kind: "join"; subFilter: object };

/** Parses an entity filter, which could be "just an id", an array of ids, or a nested filter. */
export function parseEntityFilter(meta: EntityMetadata<any>, filter: any): ParsedEntityFilter {
  if (filter === undefined) {
    // This matches legacy `em.find({ author: undefined })` behavior
    return { kind: "pass" };
  } else if (filter === null) {
    return { kind: "eq", value: null };
  } else if (typeof filter === "string" || typeof filter === "number") {
    return { kind: "eq", value: keyToNumber(meta, filter) };
  } else if (Array.isArray(filter)) {
    return {
      kind: "in",
      value: filter.map((v: string | number | Entity) => {
        return keyToNumber(meta, isEntity(v) ? v.id ?? -1 : v);
      }),
    };
  } else if (isEntity(filter)) {
    return { kind: "eq", value: keyToNumber(meta, filter.id || -1) };
  } else if (typeof filter === "object") {
    // Looking for `{ firstName: "f1" }` or `{ ne: "f1" }`
    const keys = Object.keys(filter);
    // Special case only looking at `ne`
    if (keys.length === 1 && keys[0] === "ne") {
      const value = filter["ne"];
      if (value === null || value === undefined) {
        return { kind: "ne", value: null };
      } else if (typeof value === "string" || typeof value === "number") {
        return { kind: "ne", value: keyToNumber(meta, value) };
      } else if (isEntity(value)) {
        return { kind: "ne", value: keyToNumber(meta, value.id || -1) };
      } else {
        throw new Error(`Unsupported "ne" value ${value}`);
      }
    }
    // Special case only looking at `id`
    if (keys.length === 1 && keys[0] === "id") {
      const value = filter["id"];
      if (value === null || value === undefined) {
        return { kind: "eq", value: null };
      } else if (typeof value === "string" || typeof value === "number") {
        return { kind: "eq", value: keyToNumber(meta, value) };
      } else if (isEntity(value)) {
        return { kind: "eq", value: keyToNumber(meta, value.id || -1) };
      } else {
        return parseValueFilter(value);
        throw new Error(`Unsupported "id" value ${value}`);
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
  | { kind: "eq"; value: V | null }
  | { kind: "in"; value: V[] }
  | { kind: "gt"; value: V }
  | { kind: "gte"; value: V }
  | { kind: "ne"; value: V | null }
  | { kind: "lt"; value: V }
  | { kind: "lte"; value: V }
  | { kind: "like"; value: V }
  | { kind: "ilike"; value: V }
  | { kind: "pass" }
  | { kind: "between"; value: [V, V] };

export function parseValueFilter<V>(filter: ValueFilter<V, any>): ParsedValueFilter<V> {
  if (filter === null) {
    return { kind: "eq", value: filter };
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
          return { kind: "eq", value: filter[key] ?? null };
        case "ne":
          return { kind: "ne", value: filter[key] ?? null };
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
      return { kind: op, value: value ?? null };
    } else if (keys.length === 2 && "gte" in filter && "lte" in filter) {
      const { gte, lte } = filter;
      return { kind: "between", value: [gte, lte] };
    }
    throw new Error("unsupported value filter");
  } else {
    // This is a primitive like a string, number
    return { kind: "eq", value: filter ?? null };
  }
}

function applyDbFilter(filter: ParsedValueFilter<any>, fn: (value: any) => any): void {
  switch (filter.kind) {
    case "eq":
    case "gt":
    case "gte":
    case "ne":
    case "lt":
    case "lte":
    case "like":
    case "ilike":
      filter.value = fn(filter.value);
      break;
    case "pass":
      break;
    case "in":
      filter.value = filter.value.map(fn);
      break;
    case "between":
      filter.value[0] = fn(filter.value[0]);
      filter.value[1] = fn(filter.value[1]);
      break;
    default:
      assertNever(filter);
  }
}
