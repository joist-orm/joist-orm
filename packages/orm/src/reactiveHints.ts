import { Entity } from "./Entity";
import { FieldsOf, MaybeAbstractEntityConstructor } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { FieldStatus, ManyToOneFieldStatus } from "./changes";
import { getProperties } from "./getProperties";
import { LoadHint, Loadable, Loaded } from "./loadHints";
import { NormalizeHint, SuffixSeperator, normalizeHint, suffixRe } from "./normalizeHints";
import {
  AsyncProperty,
  Collection,
  LoadedCollection,
  LoadedProperty,
  LoadedReference,
  OneToOneReference,
  Reference,
} from "./relations";
import { LoadedOneToOneReference } from "./relations/OneToOneReference";
import { AsyncPropertyImpl } from "./relations/hasAsyncProperty";
import { fail, mergeNormalizedHints } from "./utils";

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
export type Reacted<T extends Entity, H> = Entity & {
  [K in keyof NormalizeHint<T, H> & keyof T]: T[K] extends OneToOneReference<any, infer U>
    ? LoadedOneToOneReference<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>>
    : T[K] extends Reference<any, infer U, infer N>
    ? LoadedReference<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>, N>
    : T[K] extends Collection<any, infer U>
    ? LoadedCollection<T, Entity & Reacted<U, NormalizeHint<T, H>[K]>>
    : T[K] extends AsyncProperty<any, infer V>
    ? LoadedProperty<any, V>
    : T[K];
} & {
  /**
   * Gives reactive rules & fields a way to get the full entity if they really need it.
   *
   * This should be used carefully b/c it will side-step the reactive system, and instead
   * reactive rules & fields should explicitly declare access to the fields they need, which
   * will then allow accessing the field via the `Reacted<Author, ...>` type.
   */
  fullNonReactiveAccess: Loaded<T, H>;
} & MaybeTransientFields<T>;

export type MaybeTransientFields<T> = "transientFields" extends keyof T
  ? {
      transientFields: T["transientFields"];
    }
  : {};

export function reverseReactiveHint<T extends Entity>(
  rootType: MaybeAbstractEntityConstructor<T>,
  entityType: MaybeAbstractEntityConstructor<T>,
  hint: ReactiveHint<T>,
  reactForOtherSide?: string | boolean,
  isFirst: boolean = true,
): ReactiveTarget[] {
  const meta = getMetadata(entityType);
  // This is the list of primitives for this `entityType` that we will react to (if any)
  const primitives: string[] = typeof reactForOtherSide === "string" ? [reactForOtherSide] : [];
  const subHints = Object.entries(normalizeHint(hint)).flatMap(([keyMaybeSuffix, subHint]) => {
    const key = keyMaybeSuffix.replace(suffixRe, "");
    const field = meta.allFields[key];
    const isReadOnly = !!keyMaybeSuffix.match(suffixRe) || (field && field.immutable);
    if (field) {
      switch (field.kind) {
        case "m2o": {
          if (!isReadOnly) {
            primitives.push(field.fieldName);
          }
          return reverseReactiveHint(rootType, field.otherMetadata().cstr, subHint, undefined, false).map(
            ({ entity, fields, path }) => {
              return { entity, fields, path: [...path, field.otherFieldName] };
            },
          );
        }
        case "m2m":
        case "o2m":
        case "o2o": {
          const isOtherReadOnly = field.otherMetadata().allFields[field.otherFieldName].immutable;
          const otherFieldName =
            field.otherMetadata().allFields[field.otherFieldName].kind === "poly"
              ? `${field.otherFieldName}@${meta.type}`
              : field.otherFieldName;
          // This is not a field, but we want our reverse side to be reactive, so pass reactForOtherSide
          return reverseReactiveHint(
            rootType,
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
          throw new Error(`Invalid hint in ${rootType.name}.ts hint ${JSON.stringify(hint)}`);
      }
    } else {
      // We only need to look for ReactiveAsyncProperties here, because PersistedAsyncProperties
      // have primitive fields that will be handled in the ^ code. Note that we don't specifically
      // handle them ^, because the EntityManager.flush loop will notice their primitive values
      // changing, and kicking off any downstream reactive fields as necessary.
      const p = getProperties(meta)[key];
      if (p instanceof AsyncPropertyImpl) {
        if (!p.reactiveHint) {
          throw new Error(
            `AsyncProperty ${key} cannot be used in reactive hints in ${rootType.name}.ts hint ${JSON.stringify(
              hint,
            )}, please use hasReactiveAsyncProperty instead`,
          );
        }
        return reverseReactiveHint(rootType, meta.cstr, p.reactiveHint, undefined, false);
      } else {
        throw new Error(`Invalid hint in ${rootType.name}.ts ${JSON.stringify(hint)}`);
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

/**
 * Walks `reverseHint` for every entity in `entities`.
 *
 * I.e. given `[book1, book2]` and `["author", 'publisher"]`, will return all of the books' authors' publishers.
 */
export async function followReverseHint(entities: Entity[], reverseHint: string[]): Promise<Entity[]> {
  // Start at the current entities
  let current = [...entities];
  const paths = [...reverseHint];
  // And "walk backwards" through the reverse hint
  while (paths.length) {
    const path = paths.shift()!;
    const [fieldName, viaPolyType] = path.split("@");
    // The path might touch either a reference or a collection
    const entitiesOrLists = await Promise.all(
      current.flatMap((c: any) => {
        async function maybeLoadedPoly(loadPromise: Promise<Entity>) {
          if (viaPolyType) {
            const loaded: Entity = await loadPromise;
            return loaded && loaded.__orm.metadata.type === viaPolyType ? loaded : undefined;
          }
          return loadPromise;
        }
        const currentValuePromise = maybeLoadedPoly(c[fieldName].load());
        // If we're going from Book.author back to Author to re-validate the Author.books collection,
        // see if Book.author has changed, so we can re-validate both the old author's books and the
        // new author's books.
        const fieldKind = getMetadata(c).fields[fieldName]?.kind;
        const isReference = fieldKind === "m2o" || fieldKind === "poly";
        const changed = c.changes[fieldName] as FieldStatus<any>;
        if (isReference && changed.hasUpdated && changed.originalValue) {
          return [currentValuePromise, maybeLoadedPoly((changed as ManyToOneFieldStatus<any>).originalEntity)];
        }
        return [currentValuePromise];
      }),
    );
    // Use flat() to get them all as entities
    const entities = entitiesOrLists.flat().filter((e) => e !== undefined);
    current = entities as Entity[];
  }
  return current;
}

/** Converts a reactive `hint` into a load hint. */
export function convertToLoadHint<T extends Entity>(meta: EntityMetadata<T>, hint: ReactiveHint<T>): LoadHint<T> {
  const loadHint = {};
  // Process the hints individually instead of just calling Object.fromEntries so that
  // we can handle inlined reactive hints that overlap.
  for (const [keyMaybeSuffix, subHint] of Object.entries(normalizeHint(hint))) {
    const key = keyMaybeSuffix.replace(suffixRe, "");
    const field = meta.allFields[key];
    if (field) {
      switch (field.kind) {
        case "m2m":
        case "m2o":
        case "o2m":
        case "o2o": {
          mergeNormalizedHints(loadHint, { [key]: convertToLoadHint(field.otherMetadata(), subHint) });
        }
        case "primitive":
        case "enum":
          continue;
        default:
          throw new Error(`Invalid reactive hint ${meta.tableName} ${JSON.stringify(hint)}`);
      }
    } else {
      const p = getProperties(meta)[key];
      if (p && p.reactiveHint) {
        mergeNormalizedHints(loadHint, convertToLoadHint(meta, p.reactiveHint));
      } else {
        fail(`Invalid reactive hint on ${meta.tableName} ${JSON.stringify(hint)}`);
      }
    }
  }
  return loadHint as any;
}

export interface ReactiveTarget {
  entity: MaybeAbstractEntityConstructor<any>;
  fields: string[];
  path: string[];
}
