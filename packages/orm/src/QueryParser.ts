import { isEntity } from "./Entity";
import { ValueFilter } from "./EntityFilter";
import { EntityMetadata } from "./EntityMetadata";
import { keyToNumber } from "./keys";

/** An ADT version of `EntityFilter`. */
export type ParsedEntityFilter =
  | { kind: "eq"; id: number | null }
  | { kind: "ne"; id: number | null }
  | { kind: "in"; ids: number[] }
  | { kind: "join"; subFilter: any };

export function parseEntityFilter(meta: EntityMetadata<any>, filter: any): ParsedEntityFilter {
  if (filter === null || filter === undefined) {
    return { kind: "eq", id: null };
  } else if (typeof filter === "string" || typeof filter === "number") {
    return { kind: "eq", id: keyToNumber(meta, filter) };
  } else if (Array.isArray(filter)) {
    return { kind: "in", ids: filter.map((id: string | number) => keyToNumber(meta, id)) };
  } else if (isEntity(filter)) {
    return { kind: "eq", id: keyToNumber(meta, filter.id || -1) };
  } else if (typeof filter === "object") {
    const keys = Object.keys(filter);
    if (keys.length === 1 && keys[0] === "ne") {
      const value = filter["ne"];
      if (value === null || value === undefined) {
        return { kind: "ne", id: null };
      } else if (typeof value === "string" || typeof value === "number") {
        return { kind: "ne", id: keyToNumber(meta, value) };
      } else if (isEntity(value)) {
        return { kind: "ne", id: keyToNumber(meta, value.id || -1) };
      } else {
        throw new Error(`Unsupported "ne" value ${value}`);
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
