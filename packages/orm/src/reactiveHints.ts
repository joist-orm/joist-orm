import { Entity } from "./Entity";
import { FieldsOf, MaybeAbstractEntityConstructor, getEmInternalApi } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { Changes, FieldStatus, ManyToOneFieldStatus } from "./changes";
import { isChangeableField } from "./fields";
import { getProperties } from "./getProperties";
import { LoadHint, Loadable, Loaded } from "./loadHints";
import { NormalizeHint, SuffixSeperator, normalizeHint, suffixRe } from "./normalizeHints";
import {
  AsyncProperty,
  Collection,
  LoadedCollection,
  LoadedProperty,
  LoadedReference,
  ManyToManyCollection,
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
  /** Allow detecting if a reactive change is due to nuances like `hasUpdated` or `hasChanged`. */
  changes: Changes<T, keyof FieldsOf<T>, keyof NormalizeHint<T, H>>;
} & MaybeTransientFields<T>;

/** If the domain model has transient fields, allow reactive behavior to see it, i.e. don't run validation rules for special operations. */
export type MaybeTransientFields<T> = "transientFields" extends keyof T
  ? { transientFields: T["transientFields"] }
  : {};

/**
 * Takes a reactive hint and returns the `ReactiveTarget`s that, should they change, need to
 * walk back to the reactive hint's
 *
 * @param rootType The original type that contained the reactive rule/field, used for helpful error messages
 * @param entityType The current entity of the step we're walking
 * @param hint The current hint we're walking
 * @param reactForOtherSide the name of our FK column, if the previous collection needs to react to our FK changing,
 *   or true to react simplify to new/deleted entities
 * @param isFirst
 */
export function reverseReactiveHint<T extends Entity>(
  rootType: MaybeAbstractEntityConstructor<T>,
  entityType: MaybeAbstractEntityConstructor<T>,
  hint: ReactiveHint<T>,
  reactForOtherSide?: string | boolean,
  isFirst: boolean = true,
): ReactiveTarget[] {
  const meta = getMetadata(entityType);
  // This is the list of fields for this `entityType` that we will react to their changing values
  const fields: string[] = [];
  // If the hint before us was a collection, i.e. { books: ["title"] }, besides just reacting
  // to our `title` changing, `reactForOtherSide` tells us to react to our `author` field as well.
  if (typeof reactForOtherSide === "string") {
    fields.push(reactForOtherSide);
  }
  // Look through the hint for our own fields, i.e. `["title"]`, and nested hints like `{ author: "firstName" }`.
  const subHints = Object.entries(normalizeHint(hint)).flatMap(([keyMaybeSuffix, subHint]) => {
    const key = keyMaybeSuffix.replace(suffixRe, "");
    const field = meta.allFields[key];
    const isReadOnly = !!keyMaybeSuffix.match(suffixRe) || (field && field.immutable);
    if (field) {
      switch (field.kind) {
        case "m2o": {
          if (!isReadOnly) {
            fields.push(field.fieldName);
          }
          return reverseReactiveHint(rootType, field.otherMetadata().cstr, subHint, undefined, false).map(
            ({ entity, fields, path }) => {
              return { entity, fields, path: [...path, field.otherFieldName] };
            },
          );
        }
        case "m2m": {
          const otherFieldName =
            field.otherMetadata().allFields[field.otherFieldName].kind === "poly"
              ? `${field.otherFieldName}@${meta.type}`
              : field.otherFieldName;
          // While o2m and o2o can watch for just FK changes by passing `reactForOtherSide` (the FK lives in the other
          // table), for m2m reactivity we push the collection name into the reactive hint, because it's effectively
          // "the other/reverse side", and JoinRows will trigger it explicitly instead of `setField` for non-m2m keys.
          fields.push(field.fieldName);
          return reverseReactiveHint(
            rootType,
            field.otherMetadata().cstr,
            subHint,
            // For m2m, we can always pass undefined here, as otherwise having the opposite m2m collection
            // recalc all of its children will cause over-reactivity
            undefined,
            false,
          ).map(({ entity, fields, path }) => {
            return { entity, fields, path: [...path, otherFieldName] };
          });
        }
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
            // For o2m/o2o, isReadOnly will only be true if the hint is using a `:ro` / `_ro` suffix,
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
            fields.push(key);
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
        console.log(p);
        throw new Error(`Invalid hint in ${rootType.name}.ts ${JSON.stringify(hint)} key ${key}`);
      }
    }
  });
  return [
    // If any of our primitives (or m2o fields) change, establish a reactive path
    // from "here" (entityType) that is initially empty (path: []) but will have
    // paths layered on by the previous callers
    ...(fields.length > 0 || isFirst || reactForOtherSide === true ? [{ entity: entityType, fields, path: [] }] : []),
    ...subHints,
  ];
}

/**
 * Walks `reverseHint` for every entity in `entities`.
 *
 * I.e. given set of entities like `[book1, book2]` that just changed, and a path `["author", 'publisher"]` that
 * points to the `Publisher` entity that has reactive behavior, returns all the books' authors' publishers.
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
        const currentValuePromise = maybeLoadedPoly(c[fieldName].load(), viaPolyType);
        // If we're going from Book.author back to Author to re-validate the Author.books collection,
        // see if Book.author has changed, so we can re-validate both the old author's books and the
        // new author's books.
        const fieldKind = getMetadata(c).fields[fieldName]?.kind;
        const isReference = fieldKind === "m2o" || fieldKind === "poly";
        const isManyToMany = fieldKind === "m2m";
        const changed = isChangeableField(c, fieldName) ? (c.changes[fieldName] as FieldStatus<any>) : undefined;
        if (isReference && changed && changed.hasUpdated && changed.originalValue) {
          return [
            currentValuePromise,
            maybeLoadedPoly((changed as ManyToOneFieldStatus<any>).originalEntity, viaPolyType),
          ];
        }
        if (isManyToMany) {
          const m2m = c[fieldName] as ManyToManyCollection<any, any>;
          const joinRows = getEmInternalApi(m2m.entity.em).joinRows(m2m);
          return [currentValuePromise, joinRows.removedFor(m2m, c)];
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

/** Converts a normalized reactive `hint` into a load hint. */
export function convertToLoadHint<T extends Entity>(meta: EntityMetadata, hint: ReactiveHint<T>): LoadHint<T> {
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
        case "o2o":
          mergeNormalizedHints(loadHint, { [key]: convertToLoadHint(field.otherMetadata(), subHint) });
          break;
        case "primitive":
          if (field.derived === "async") {
            mergeNormalizedHints(loadHint, { [key]: {} });
          }
          continue;
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

/** An entity that, when `fields` change, should trigger the reactive rule/field pointed to by `path`. */
export interface ReactiveTarget {
  /** The entity that contains a field our reactive rule/field accesses. */
  entity: MaybeAbstractEntityConstructor<any>;
  /** The field(s) that our reactive rule/field accesses, plus any implicit fields like FKs. */
  fields: string[];
  /** The path from this `entity` back to the source reactive rule/field. */
  path: string[];
}

/**
 * When traversing back through a hint, if we hint a poly, the subsequent steps of the path
 * will only be valid if the poly is the correct type.
 */
async function maybeLoadedPoly(loadPromise: Promise<Entity>, viaPolyType: string | undefined) {
  if (viaPolyType) {
    const loaded: Entity = await loadPromise;
    return loaded && getMetadata(loaded).type === viaPolyType ? loaded : undefined;
  }
  return loadPromise;
}
