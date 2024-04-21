import { Entity, isEntity } from "./Entity";
import { IdOf } from "./EntityManager";
import { getMetadata } from "./EntityMetadata";
import { normalizeHint } from "./normalizeHints";
import { convertToLoadHint } from "./reactiveHints";
import { AsyncMethod, AsyncProperty, Collection, ReactiveGetter, Reference } from "./relations";
import { AbstractRelationImpl } from "./relations/AbstractRelationImpl";
import { ReactiveFieldImpl } from "./relations/ReactiveField";
import { ReactiveGetterImpl } from "./relations/ReactiveGetter";
import { ReactiveQueryFieldImpl } from "./relations/ReactiveQueryField";
import { AsyncPropertyImpl } from "./relations/hasAsyncProperty";

/**
 * A JSON hint of a single key, multiple keys, or nested keys and sub-hints.
 *
 * JSON hints are much like load hints/reactive hints:
 *
 * - Similar to load hints, they specify which relations should be loaded from the database
 * - Similar to reactive hints, they include specific fields to output
 * - Unlike either, they can include completely custom keys that are lambdas to generate custom values
 */
export type JsonHint<T extends Entity> =
  | (keyof Jsonable<T> & string)
  | ReadonlyArray<keyof Jsonable<T> & string>
  | (NestedJsonHint<T> | CustomJsonKeys<T>);

type CustomJsonKeys<T> = {
  [key: string]: (entity: T) => any;
};

export type NestedJsonHint<T extends Entity> = {
  [K in keyof Jsonable<T>]?: (Jsonable<T>[K] extends infer U extends Entity ? JsonHint<U> : {}) | boolean;
};

/** The keys in `T` that we can put into a JSON payload. */
export type Jsonable<T extends Entity> = {
  -readonly [K in keyof T as JsonableValue<T[K]> extends never ? never : K]: JsonableValue<T[K]>;
};

// this should probably be `keyof T` as long as they aren't methods/AsyncMethods.
// so primitives, enums, references, collections, async properties, but also random getters.
export type JsonableValue<V> =
  V extends Reference<any, infer U, any>
    ? U
    : V extends Collection<any, infer U>
      ? U
      : V extends AsyncMethod<any, any, any>
        ? never
        : V extends AsyncProperty<any, infer P>
          ? DropUndefined<P>
          : V extends ReactiveGetter<any, infer P>
            ? P
            : V;

/**
 * Provides an API to put an entity, or list of entities, into a JSON payload.
 *
 * The `hint` parameter is a JSON hint that describes what to include in the payload,
 *
 * - fields like `id`, `name`, etc.
 * - relations like m2o, o2m, m2m, and o2o
 *   - relations are allowed to provide nested hints, just like nested load hints
 * - custom fields like `fullName: (entity) => entity.firstName + ' ' + entity.lastName`
 */
export async function toJSON<T extends Entity, const H extends JsonHint<T>>(
  entity: T,
  hint: H,
): Promise<JsonPayload<T, H>>;
/**
 * Provides an API to put an entity, or list of entities, into a JSON payload.
 *
 * The `hint` parameter is a JSON hint that describes what to include in the payload,
 *
 * - fields like `id`, `name`, etc.
 * - relations like m2o, o2m, m2m, and o2o
 *   - relations are allowed to provide nested hints, just like nested load hints
 * - custom fields like `fullName: (entity) => entity.firstName + ' ' + entity.lastName`
 */
export async function toJSON<T extends Entity, const H extends JsonHint<T>>(
  entities: readonly T[],
  hint: H,
): Promise<JsonPayload<T, H>[]>;
export async function toJSON<T extends Entity, const H extends JsonHint<T>>(
  entityOrList: T | readonly T[],
  hint: H,
): Promise<JsonPayload<T, H> | JsonPayload<T, H>[]> {
  // If called with a list, and nothing there, just early return
  if (Array.isArray(entityOrList) && entityOrList.length === 0) return [];

  // Otherwise probe to get our first entity
  const entity = Array.isArray(entityOrList) ? entityOrList[0] : entityOrList;
  const loadHint = convertToLoadHint(getMetadata(entity), hint as any, true);
  await entity.em.populate(entityOrList, loadHint);

  if (Array.isArray(entityOrList)) {
    const list = [];
    for (const entity of entityOrList) {
      const json = {};
      await copyToPayload(json, entity, normalizeHint(hint as any));
      list.push(json);
    }
    return list as any;
  } else {
    const json = {};
    await copyToPayload(json, entity, normalizeHint(hint as any));
    return json as any;
  }
}

/**
 * Statically types the return value of `toJSON` based on the given `hint`.
 */
export type JsonPayload<T, H> = {
  [K in keyof NormalizeHint<H>]: K extends keyof T
    ? T[K] extends Reference<any, infer U, any>
      ? JsonPayloadReference<U, NormalizeHint<H>[K]>
      : T[K] extends Collection<any, infer U>
        ? JsonPayloadCollection<U, NormalizeHint<H>[K]>
        : T[K] extends AsyncProperty<any, infer U>
          ? JsonPayloadProperty<U, NormalizeHint<H>[K]>
          : T[K] extends ReactiveGetter<any, infer V>
            ? V
            : T[K]
    : JsonPayloadCustom<NormalizeHint<H>[K]>;
};

// type JsonPayloadAttempt<T, K> =

// If the hint is empty, we just output the id as a string.
type JsonPayloadReference<U, H> = IsEmpty<H> extends true ? string : JsonPayload<U, H>;

type JsonPayloadCollection<U extends Entity, H> =
  // If this is `books: true`, use the id
  H extends true
    ? IdOf<U>[]
    : // If this is `{}`, use the id
      IsEmpty<H> extends true
      ? IdOf<U>[]
      : // Otherwise it's a nested hint
        JsonPayload<U, H>[];

type JsonPayloadProperty<P, H> =
  // If an async property returns an entity, treat it like a reference
  P extends Entity | undefined
    ? JsonPayloadReference<P, H>
    : // If an async property returns an entity[], treat it like a collection
      P extends (infer U extends Entity)[] | undefined
      ? JsonPayloadCollection<U, H>
      : // Otherwise leave it as-is
        P;

type JsonPayloadCustom<H> = H extends (...args: any) => infer V ? UnwrapPromise<V> : H;

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/** Recursively copies the fields of `hint` from `entity` into the `payload`. */
async function copyToPayload(payload: Record<string, {}>, entity: any, hint: object): Promise<void> {
  // Look at each key in the hint and determine
  for (const [payloadKey, nestedHint] of Object.entries(hint)) {
    const nextHint = normalizeHint(nestedHint);
    // Watch for `companyId`
    let entityKey = payloadKey;
    if (!(entityKey in entity)) {
      const field = Object.values(getMetadata(entity).allFields).find((f) => f.fieldIdName === payloadKey);
      if (field) {
        entityKey = field.fieldName;
      }
    }
    // Look for custom props
    if (!(entityKey in entity)) {
      if (typeof nestedHint !== "function") {
        throw new Error(`Entity does not have a property ${payloadKey}`);
      }
      payload[payloadKey] = await nestedHint(entity);
    } else {
      const value = entity[entityKey];
      if (isPrimitive(value)) {
        payload[payloadKey] = value;
      } else if (
        value instanceof AbstractRelationImpl ||
        value instanceof ReactiveFieldImpl ||
        value instanceof ReactiveGetterImpl ||
        value instanceof ReactiveQueryFieldImpl ||
        value instanceof AsyncPropertyImpl
      ) {
        await copyToPayloadValue(payload, payloadKey, value.get, nextHint);
      } else {
        throw new Error(`Unable to encode value ${value} to JSON`);
      }
    }
  }
}

function copyToPayloadValue(payload: any, key: any, value: any, nextHint: any): Promise<unknown> | undefined {
  if (value === undefined || value === null || isPrimitive(value)) {
    payload[key] = value;
  } else if (isEntity(value)) {
    if (nextHint && Object.keys(nextHint).length > 0) {
      payload[key] = {};
      return copyToPayload(payload[key], value, nextHint);
    } else {
      payload[key] = value.id;
    }
  } else if (Array.isArray(value)) {
    const list = [] as any[];
    payload[key] = list;
    if (nextHint && Object.keys(nextHint).length > 0) {
      return Promise.all(
        value.map(async (item, i) => {
          if (isEntity(item)) {
            list[i] = {};
            return copyToPayload(list[i], item, nextHint);
          } else {
            // This is probably undefined
            list[i] = item;
          }
        }),
      );
    } else {
      // This is assuming an array of entities...
      for (const item of value) list.push(item.id);
    }
  } else {
    payload[key] = value;
  }
}

function isPrimitive(value: any): boolean {
  return value === null || typeof value !== "object";
}

type DropUndefined<T> = T extends infer U extends Entity | undefined ? U : T;

// A copy/paste of NormalizeHint w/o the `DropSuffix` stuff
type NormalizeHint<H> = H extends string
  ? Record<H, {}>
  : H extends ReadonlyArray<any>
    ? Record<H[number], {}>
    : { [K in keyof H]: H[K] };

type IsEmpty<T> = keyof T extends never ? true : false;
