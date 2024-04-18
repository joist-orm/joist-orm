import { Entity } from "./Entity";
import { getMetadata } from "./EntityMetadata";
import { normalizeHint } from "./normalizeHints";
import { convertToLoadHint } from "./reactiveHints";
import { AsyncMethod, AsyncProperty, Collection, ManyToOneReferenceImpl, ReactiveGetter, Reference } from "./relations";
import {LoadHint} from "./loadHints";

/**
 *  A JSON hint of a single key, multiple keys, or nested keys and sub-hints.
 */
export type JsonHint<T extends Entity> =
  | (keyof Jsonable<T> & string)
  | ReadonlyArray<keyof Jsonable<T> & string>
  | (NestedJsonHint<T> | CustomJsonKeys<T>);

type CustomJsonKeys<T> = {
  [key: string]: (entity: T) => any | [hint: LoadHint<any>];
};

export type NestedJsonHint<T extends Entity> = {
  [K in keyof Jsonable<T>]?: Jsonable<T>[K] extends infer U extends Entity ? JsonHint<U> : {};
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

export async function toJSON<T extends Entity, const H extends JsonHint<T>>(
  entity: T,
  hint: H,
): Promise<JsonPayload<T, H>> {
  const loadHint = convertToLoadHint(getMetadata(entity), hint as any, true);
  await entity.em.populate(entity, loadHint);
  const json = {};
  await copyToPayload(json, entity, normalizeHint(hint as any));
  return json as any;
}

export type JsonPayload<T, H> = {
  [K in keyof NormalizeHint<H>]: K extends keyof T
    ? T[K] extends Reference<any, infer U, any>
      ? JsonPayloadReference<U, NormalizeHint<H>[K]>
      : T[K]
    : JsonPayloadCustom<NormalizeHint<H>[K]>;
};

// If the hint is empty, we just output the id as a string.
type JsonPayloadReference<U, H> = IsEmpty<H> extends true ? string : JsonPayload<U, H>;

type JsonPayloadCustom<H> = H extends (...args: any) => infer V ? UnwrapPromise<V> : H;

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

async function copyToPayload(payload: any, entity: any, hint: object): Promise<void> {
  for (const [key, nestedHint] of Object.entries(hint)) {
    // Look for custom props
    if (!(key in entity)) {
      // Probably detect if this isn't a function...
      payload[key] = await nestedHint(entity);
      continue;
    }
    const value = entity[key];
    if (isPrimitive(value)) {
      payload[key] = value;
    } else if (value instanceof ManyToOneReferenceImpl) {
      const norm = normalizeHint(nestedHint);
      if (norm && Object.keys(norm).length > 0) {
        payload[key] = {};
        await copyToPayload(payload[key], value.get, norm);
      } else {
        payload[key] = value.idMaybe;
      }
    } else {
      throw new Error(`Unable to encode value ${value} to JSON`);
    }
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
