import { Entity } from "./Entity";
import { EntityConstructor, FieldsOf } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { getProperties } from "./getProperties";
import { Loadable, Loaded, LoadHint } from "./loadHints";
import { NormalizeHint, normalizeHint, suffixRe, SuffixSeperator } from "./normalizeHints";
import {
  AsyncProperty,
  Collection,
  LoadedCollection,
  LoadedProperty,
  LoadedReference,
  OneToOneReference,
  Reference,
} from "./relations";
import { AsyncPropertyImpl } from "./relations/hasAsyncProperty";
import { LoadedOneToOneReference } from "./relations/OneToOneReference";
import { fail } from "./utils";

/** The keys in `T` that rules & hooks can react to. */
export type Reactable<T extends Entity> = FieldsOf<T> & Loadable<T> & SuffixedFieldsOf<T> & SuffixedLoadable<T>;

/** The fields of `T` suffixed with `:ro` or `_ro`. */
type SuffixedFieldsOf<T extends Entity> = {
  [K in keyof FieldsOf<T> & string as `${K}${SuffixSeperator}ro`]: FieldsOf<T>[K];
};

type SuffixedLoadable<T extends Entity> = {
  [K in keyof Loadable<T> & string as `${K}${SuffixSeperator}ro`]: Loadable<T>[K];
};

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
export type Reacted<T extends Entity, H extends ReactiveHint<T>> = Entity & {
  [K in keyof NormalizeHint<T, H> & keyof T]: T[K] extends OneToOneReference<any, infer U>
    ? NormalizeHint<T, H>[K] extends ReactiveHint<U>
      ? LoadedOneToOneReference<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>>
      : LoadedOneToOneReference<T, Entity & Reacted<U, {}>>
    : T[K] extends Reference<any, infer U, infer N>
    ? NormalizeHint<T, H>[K] extends ReactiveHint<U>
      ? LoadedReference<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>, N>
      : LoadedReference<T, Entity & Reacted<U, {}>, N>
    : T[K] extends Collection<any, infer U>
    ? NormalizeHint<T, H>[K] extends ReactiveHint<U>
      ? LoadedCollection<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>>
      : LoadedCollection<T, Entity & Reacted<U, {}>>
    : T[K] extends AsyncProperty<any, infer V>
    ? LoadedProperty<any, V>
    : T[K];
} & {
  // Give validation rules a way to get back to the full entity if they really need it
  entity: NormalizeHint<T, H> extends LoadHint<T> ? Loaded<T, NormalizeHint<T, H>> : T;
};

export function reverseReactiveHint<T extends Entity>(
  entityType: EntityConstructor<T>,
  hint: ReactiveHint<T>,
  reactForOtherSide?: string | boolean,
  isFirst: boolean = true,
): ReactiveTarget[] {
  const meta = getMetadata(entityType);
  const primitives: string[] = typeof reactForOtherSide === "string" ? [reactForOtherSide] : [];
  const subHints = Object.entries(normalizeHint(hint)).flatMap(([keyMaybeSuffix, subHint]) => {
    const key = keyMaybeSuffix.replace(suffixRe, "");
    const field = meta.fields[key];
    const isReadOnly = !!keyMaybeSuffix.match(suffixRe) || (field && field.immutable);
    if (field) {
      switch (field.kind) {
        case "m2o": {
          if (!isReadOnly) {
            primitives.push(field.fieldName);
          }
          return reverseReactiveHint(field.otherMetadata().cstr, subHint, undefined, false).map(
            ({ entity, fields, path }) => {
              return { entity, fields, path: [...path, field.otherFieldName] };
            },
          );
        }
        case "m2m":
        case "o2m":
        case "o2o": {
          const isOtherReadOnly = field.otherMetadata().fields[field.otherFieldName].immutable;
          const otherFieldName =
            field.otherMetadata().fields[field.otherFieldName].kind === "poly"
              ? `${field.otherFieldName}@${meta.type}`
              : field.otherFieldName;
          // This is not a field, but we want our reverse side to be reactive, so pass reactForOtherSide
          return reverseReactiveHint(
            field.otherMetadata().cstr,
            subHint,
            // For o2m/o2o/m2m, isReadOnly will only be true if the hint is using a `:ro` / `_ro` suffix,
            // in which case we really do want to be read-only. But if isOtherReadOnly is true, then we
            // don't need to "react to the field changing" (which can't happen for immutable fields), but
            // we do need to react to children being created/deleted.
            isReadOnly ? undefined : isOtherReadOnly ? true : field.otherFieldName,
            false,
          ).map(({ entity, fields, path }) => {
            return { entity, fields, path: [...path, otherFieldName] };
          });
        }
        case "primitive":
        case "enum":
          if (!isReadOnly) {
            primitives.push(key);
          }
          return [];
        default:
          throw new Error(`Invalid hint ${entityType.name} ${JSON.stringify(hint)}`);
      }
    } else {
      const p = getProperties(meta)[key];
      if (p instanceof AsyncPropertyImpl) {
        return reverseReactiveHint(meta.cstr, p.hint, undefined, false);
      } else {
        throw new Error(`Invalid hint ${entityType.name} ${JSON.stringify(hint)}`);
      }
    }
  });
  return [
    // If any of our primitives (or m2o fields) change, establish a reactive path
    // from "here" (entityType) that is initially empty (path: []) but will have
    // paths layered on by the previous callers
    ...(primitives.length > 0 || isFirst || reactForOtherSide === true
      ? [{ entity: entityType, fields: primitives, path: [] }]
      : []),
    ...subHints,
  ];
}

export function convertToLoadHint<T extends Entity>(meta: EntityMetadata<T>, hint: ReactiveHint<T>): LoadHint<T> {
  return Object.fromEntries(
    Object.entries(normalizeHint(hint)).flatMap(([keyMaybeSuffix, subHint]) => {
      const key = keyMaybeSuffix.replace(suffixRe, "");
      const field = meta.fields[key];
      if (field) {
        switch (field.kind) {
          case "m2m":
          case "m2o":
          case "o2m":
          case "o2o": {
            return [[key, convertToLoadHint(field.otherMetadata(), subHint)]];
          }
          case "primitive":
          case "enum":
            return [];
          default:
            throw new Error(`Invalid hint ${meta.tableName} ${JSON.stringify(hint)}`);
        }
      } else {
        const p = getProperties(meta)[key];
        if (p && p.hint) {
          return Object.entries(convertToLoadHint(meta, p.hint));
        } else {
          fail(`Invalid hint ${meta.tableName} ${JSON.stringify(hint)}`);
        }
      }
    }),
  ) as any;
}

export interface ReactiveTarget {
  entity: EntityConstructor<any>;
  fields: string[];
  path: string[];
}
