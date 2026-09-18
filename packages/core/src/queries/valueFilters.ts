import { isPlainObject } from "joist-utils";

import type { Column } from "../columns.ts";
import { type Entity, isEntity } from "../Entity.ts";
import { isDefined } from "../EntityManager.ts";
import type { EntityMetadata } from "../EntityMetadata.ts";
import { assertNever } from "../utils.ts";
import { isAlias } from "./find/Aliases.ts";
import type { ValueFilter } from "./find/EntityFilter.ts";
import { isScope } from "./find/scopes.ts";
import type { ParsedValueFilter } from "./parsedConditions.ts";

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
  } else if (isScope(filter)) {
    // A scope on a relation (e.g. `{ author: Author.adult }`) always implies conditions on the
    // related entity, so signal "needs a join" via the existing `join` discriminant rather than
    // adding a dedicated `kind: "scope"` that every relation branch would have to learn. The empty
    // `subFilter` is intentionally never read: the m2o/m2m branches only check `kind === "join"` to
    // decide whether to join, then re-dispatch the original scope value back through `addTable`,
    // where `isScope(...)` routes it to `addScopeFilterAt` to apply the scope's actual fragments.
    return { kind: "join", subFilter: {} };
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
      if (shouldPruneValueFilter(op, value)) {
        return [];
      } else if (value === null) {
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
          if (shouldPruneValueFilter(key, value)) {
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

/** Converts a search term like `foo bar` into a SQL `like` pattern like `%foo%bar%`. */
export function makeLike(search: any | undefined): any {
  return search ? `%${search.replace(/\s+/g, "%")}%` : undefined;
}

/** Recognizes placeholder IDs used when a filter contains an unpersisted entity. */
export function isNilIdValue(value: unknown): boolean {
  return value === -1 || value === "00000000-0000-0000-0000-000000000000";
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

/** Returns true for values that should be treated like an omitted filter. */
function shouldPruneValueFilter(key: unknown, value: unknown): boolean {
  if (value === undefined) return true;
  return value === false && key !== "eq" && key !== "ne";
}
