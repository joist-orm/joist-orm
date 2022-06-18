import { Entity } from "./Entity";
import { EntityConstructor, FieldsOf } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { Loadable, LoadHint } from "./loadHints";
import { NormalizeHint, normalizeHint } from "./normalizeHints";
import { Collection, LoadedCollection, LoadedReference, Reference } from "./relations";
import { fail } from "./utils";

/** The keys in `T` that rules & hooks can react to. */
export type Reactable<T extends Entity> = FieldsOf<T> & Loadable<T>;

/**
 * A reactive hint of a single key, multiple keys, or nested keys and sub-hints.
 *
 * Reactive hints are different from load hints in that reactive hints include specific
 * fields to react against, while load hints contain only relations, collections, and async
 * properties to preload.
 */
export type ReactiveHint<T extends Entity> =
  | (keyof Reactable<T> & string)
  | ReadonlyArray<keyof Reactable<T> & string>
  | NestedReactiveHint<T>;

export type NestedReactiveHint<T extends Entity> = {
  [K in keyof Reactable<T>]?: Reactable<T>[K] extends infer U extends Entity ? ReactiveHint<U> : {};
};

/** Given an entity `T` that is being reacted with hint `H`, mark only the `H` attributes visible & populated. */
export type Reacted<T extends Entity, H> = Entity & {
  [K in keyof NormalizeHint<T, H> & keyof T]: T[K] extends Reference<any, infer U, infer N>
    ? LoadedReference<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>, N>
    : T[K] extends Collection<any, infer U>
    ? LoadedCollection<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>>
    : T[K];
} & { entity: T };

/**
 * Given a load hint of "given an entity, load these N things", return an array
 * of what those N things are, and reversed load hints to "come back" to the
 * original entity.
 *
 * For example given a hint of `publisher -> authors -> { books, comments }`,
 * return `[Book, [author, publisher]]` and `[Comment, [author, publisher]]`.
 */
export function reverseHint<T extends Entity>(entityType: EntityConstructor<T>, hint: LoadHint<T>): ReactiveTarget[] {
  const meta = getMetadata(entityType);
  return Object.entries(normalizeHint(hint)).flatMap(([key, subHint]) => {
    const field = meta.fields[key] || fail(`Invalid hint ${entityType.name} ${JSON.stringify(hint)}`);
    if (field.kind !== "m2m" && field.kind !== "m2o" && field.kind !== "o2m" && field.kind !== "o2o") {
      throw new Error("Invalid hint");
    }
    const otherMeta = field.otherMetadata();
    const me = { entity: otherMeta.cstr, fields: [field.otherFieldName], path: [field.otherFieldName] };
    return [
      me,
      ...reverseHint(otherMeta.cstr, subHint).map(({ entity, fields, path }) => {
        return { entity, fields, path: [...path, field.otherFieldName] };
      }),
    ];
  });
}

export function reverseReactiveHint<T extends Entity>(
  entityType: EntityConstructor<T>,
  hint: ReactiveHint<T>,
  reactForOtherSide?: string,
): ReactiveTarget[] {
  const meta = getMetadata(entityType);
  const primitives: string[] = reactForOtherSide ? [reactForOtherSide] : [];
  const subHints = Object.entries(normalizeHint(hint)).flatMap(([key, subHint]) => {
    const field = meta.fields[key] || fail(`Invalid hint ${entityType.name} ${JSON.stringify(hint)}`);
    switch (field.kind) {
      case "m2o": {
        const otherMeta = field.otherMetadata();
        primitives.push(field.fieldName);
        return reverseReactiveHint(otherMeta.cstr, subHint).map(({ entity, fields, path }) => {
          return { entity, fields, path: [...path, field.otherFieldName] };
        });
      }
      case "m2m":
      case "o2m":
      case "o2o": {
        const otherMeta = field.otherMetadata();
        // This is not a field, but we want our reverse side to be reactive, so pass reactForOtherSide
        return reverseReactiveHint(otherMeta.cstr, subHint, field.otherFieldName).map(({ entity, fields, path }) => {
          return { entity, fields, path: [...path, field.otherFieldName] };
        });
      }
      case "primitive":
        primitives.push(key);
        return [];
      default:
        throw new Error("Invalid hint");
    }
  });
  if (primitives.length === 0) {
    return subHints;
  } else {
    // If any of our primitives (or m2o fields) change, establish a reactive path
    // from "here" (entityType) that is empty (path: []) but will have paths layer
    // on by the previous callers
    return [{ entity: entityType, fields: primitives, path: [] }, ...subHints];
  }
}

export function convertToLoadHint<T extends Entity>(meta: EntityMetadata<T>, hint: ReactiveHint<T>): LoadHint<T> {
  return Object.fromEntries(
    Object.entries(normalizeHint(hint)).flatMap(([key, subHint]) => {
      const field = meta.fields[key] || fail(`Invalid hint ${meta.tableName} ${JSON.stringify(hint)}`);
      switch (field.kind) {
        case "m2m":
        case "m2o":
        case "o2m":
        case "o2o": {
          return [[key, convertToLoadHint(field.otherMetadata(), subHint)]];
        }
        case "primitive":
          return [];
        default:
          throw new Error("Invalid hint");
      }
    }),
  ) as any;
}

export interface ReactiveTarget {
  entity: EntityConstructor<any>;
  fields: string[];
  path: string[];
}
