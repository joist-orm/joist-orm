import { Entity } from "./Entity";
import { getEmInternalApi, MaybeAbstractEntityConstructor } from "./EntityManager";
import {
  EntityMetadata,
  getBaseAndSelfMetas,
  getMetadata,
  getSubMetas,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PolymorphicFieldComponent,
} from "./EntityMetadata";
import { Changes, FieldStatus, ManyToOneFieldStatus } from "./changes";
import { getMetadataForType } from "./configure";
import { isChangeableField } from "./fields";
import { getProperties } from "./getProperties";
import { Loadable, Loaded, LoadHint } from "./loadHints";
import { NormalizeHint, normalizeHint, suffixRe, SuffixSeperator } from "./normalizeHints";
import {
  AsyncProperty,
  AsyncPropertyImpl,
  Collection,
  LoadedCollection,
  LoadedProperty,
  LoadedReadOnlyCollection,
  LoadedReference,
  ManyToManyCollection,
  OneToOneReference,
  PolymorphicReference,
  ReactiveGetter,
  ReadOnlyCollection,
  Reference,
} from "./relations";
import { LoadedOneToOneReference } from "./relations/OneToOneReference";
import { ReactiveGetterImpl } from "./relations/ReactiveGetter";
import {
  RecursiveChildrenCollectionImpl,
  RecursiveM2mCollectionImpl,
  RecursiveParentsCollectionImpl,
} from "./relations/RecursiveCollection";
import { FieldsOf, RelationsOf } from "./typeMap";
import { fail, flatAndUnique, mergeNormalizedHints } from "./utils";

/** The keys in `T` that rules & hooks can react to. */
export type Reactable<T extends Entity> =
  // This will be primitives + enums + m2os
  FieldsOf<T> &
    // We include `Loadable` so that we include hasReactiveAsyncProperties,
    // which are reversable but won't be in any of our codegen types.
    Loadable<T> &
    Gettable<T> &
    SuffixedFieldsOf<T> &
    SuffixedLoadable<T> &
    SuffixedGettable<T>;

/** Finds `hasReactiveGetters` which are not "loadable" b/c they're always loaded. */
export type Gettable<T extends Entity> = {
  -readonly [K in keyof T as GettableValue<T[K]> extends never ? never : K]: GettableValue<T[K]>;
};

type GettableValue<V> = V extends ReactiveGetter<any, infer P> ? P : never;

/** The fields of `T` suffixed with `:ro` or `_ro`. */
type SuffixedFieldsOf<T extends Entity> = {
  [K in keyof FieldsOf<T> & string as `${K}${SuffixSeperator}ro`]: FieldsOf<T>[K];
};

type SuffixedLoadable<T extends Entity> = {
  [K in keyof Loadable<T> & string as `${K}${SuffixSeperator}ro`]: Loadable<T>[K];
};

type SuffixedGettable<T extends Entity> = {
  [K in keyof Gettable<T> & string as `${K}${SuffixSeperator}ro`]: Gettable<T>[K];
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
  [K in keyof NormalizeHint<H> & keyof T]: T[K] extends OneToOneReference<any, infer U>
    ? LoadedOneToOneReference<T, Entity & Reacted<U, NormalizeHint<H>[K]>>
    : // Add an explicit check for PolymorphicReference because it can add `PolymorphicReference &` which gives access to `idIfSet`
      // ...although maybe LoadedReference should just have `idIfSet` in it as well? LoadedOneToOneReference does...
      T[K] extends PolymorphicReference<any, infer U, infer N>
      ? PolymorphicReference<T, U, N> & LoadedReference<T, Entity & Reacted<U, NormalizeHint<H>[K]>, N>
      : T[K] extends Reference<any, infer U, infer N>
        ? LoadedReference<T, Entity & Reacted<U, NormalizeHint<H>[K]>, N>
        : T[K] extends Collection<any, infer U>
          ? LoadedCollection<T, Entity & Reacted<U, NormalizeHint<H>[K]>>
          : T[K] extends ReadOnlyCollection<any, infer U>
            ? LoadedReadOnlyCollection<T, Entity & Reacted<U, NormalizeHint<H>[K]>>
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
  changes: Changes<T, keyof (FieldsOf<T> & RelationsOf<T>), keyof NormalizeHint<H>>;
} & MaybeTransientFields<T>;

/** Allow returning reacted entities from `hasReactiveReference`. */
export type MaybeReactedEntity<V> = V extends Entity ? { fullNonReactiveAccess: V } : V;

/**
 * Allow returning reacted entities from `hasReactiveAsyncProperty`.
 *
 * The `MaybeReactedEntity` is used by `hasReactiveReference` which already has `undefined | never`
 * broken out as a separate generic; `hasReactiveAsyncProperty` does not, and so this type conditionally
 * pulls `undefined` out first, and then defers to `MaybeReactedEntity`.
 */
export type MaybeReactedPropertyEntity<V> = V extends (infer V1 extends Entity) | undefined
  ? MaybeReactedEntity<V1> | undefined
  : MaybeReactedEntity<V>;

/**
 * A reactive hint that only allows fields immediately on the entity, i.e. no nested hints.
 *
 * This is used by `ReactiveGetter`s to guarantee that their lambda functions will
 * always be `.get`-able and hence not need loading.
 */
export type ShallowReactiveHint<T extends Entity> =
  | (keyof FieldsOf<T> & string)
  | ReadonlyArray<keyof FieldsOf<T> & string>;

/** If the domain model has transient fields, allow reactive behavior to see it, i.e. don't run validation rules for special operations. */
export type MaybeTransientFields<T> = "transientFields" extends keyof T
  ? { transientFields: T["transientFields"] }
  : {};

/**
 * Takes a reactive hint and returns the `ReactiveTarget`s that, should they change, need to
 * walk back to this watching reactable.
 *
 * @param rootType The original type that contained the reactive rule/field, used for helpful error messages
 * @param entityType The current entity of the step we're walking
 * @param hint The current hint we're walking
 * @param reactForOtherSide the name of our FK column, if the previous collection needs to react to our FK changing
 * @param isFirst
 */
export function reverseReactiveHint<T extends Entity>(
  rootType: MaybeAbstractEntityConstructor<T>,
  entityType: MaybeAbstractEntityConstructor<T>,
  hint: ReactiveHint<T>,
  reactForOtherSide?: string,
  reactForOtherSideIsReadOnly?: "field-read-only" | "hint-read-only" | false,
  isFirst: boolean = true,
): ReactiveTarget[] {
  const meta = getMetadata(entityType);
  // This is the list of fields for this `entityType` that we will react to their changing values
  const fields: string[] = [];
  const readOnlyFields: string[] = [];
  const maybeRecursive: ReactiveTarget[] = [];

  // If the hint before us was a collection, i.e. { books: ["title"] }, besides just reacting
  // to our `title` changing, `reactForOtherSide` tells us to react to our `author` field as well.
  if (reactForOtherSide) {
    const _fields = reactForOtherSideIsReadOnly ? readOnlyFields : fields;
    _fields.push(reactForOtherSide);
    if (meta.timestampFields?.deletedAt) {
      _fields.push(meta.timestampFields.deletedAt);
    }
  }

  // Look through the hint for our own fields, i.e. `["firstName", "lastName]`, and nested hints like `{ books: "title" }`.
  const subHintTargets: ReactiveTarget[] = Object.entries(normalizeHint(hint)).flatMap(([keyMaybeSuffix, subHint]) => {
    return reverseSubHint(
      rootType,
      entityType,
      hint,
      meta,
      // Pass fields & readOnlyFields, so `reverseSubHint` can append any of our primitive fields it finds
      fields,
      readOnlyFields,
      maybeRecursive,
      keyMaybeSuffix, // maybeSuffix = might end with `_ro` like `name_ro`
      subHint,
    );
  });

  const myTargets: ReactiveTarget[] = [];
  // If any of our primitives (or m2o fields) change, establish a reactive path from "here" (entityType)
  // that is initially empty (path: []) but will have paths layered on by upstream callers
  if (fields.length > 0 || isFirst || reactForOtherSideIsReadOnly === "field-read-only") {
    myTargets.push({ kind: "update", entity: entityType, fields, path: [] });
  }
  // Normally read-only fields don't trigger true async reactivity, but IsLoadedCache
  // needs them for same-EM cache invalidation.
  if (readOnlyFields.length > 0) {
    myTargets.push({ kind: "read-only", entity: entityType, fields: readOnlyFields, path: [] });
  }

  return [...myTargets, ...maybeRecursive, ...subHintTargets];
}

function reverseSubHint(
  rootType: MaybeAbstractEntityConstructor<any>,
  entityType: MaybeAbstractEntityConstructor<any>,
  hint: any,
  meta: EntityMetadata,
  fields: string[],
  readOnlyFields: string[],
  maybeRecursive: ReactiveTarget[],
  keyMaybeSuffix: string,
  subHint: any,
): ReactiveTarget[] {
  const key = keyMaybeSuffix.replace(suffixRe, "");
  const field = meta.allFields[key];
  const isReadOnly = !!keyMaybeSuffix.match(suffixRe) || (field && field.immutable);
  const _fields = isReadOnly ? readOnlyFields : fields;
  if (field) {
    switch (field.kind) {
      case "m2o": {
        // If this is a ReactiveReference, maybe we do something different?
        _fields.push(field.fieldName);
        const otherMeta = field.otherMetadata();
        // If this is a ReactiveReference, it won't have an "other" side, which is fine if:
        // - we're only reacting to the RR value itself (and have no sub-hints), or
        // - all of our sub-hints are read-only
        const otherField = otherMeta.allFields[field.otherFieldName];
        if (!otherField && !isAllReadOnly(subHint)) {
          throw new Error(
            `Invalid hint in ${rootType.name}.ts, we don't currently support reacting through ReactiveReferences, ${JSON.stringify(hint)}`,
          );
        }
        return reverseReactiveHint(rootType, otherMeta.cstr, subHint, undefined, false, false).map(
          appendPath(maybeAddTypeFilterSuffix(meta, field)),
        );
      }
      case "poly": {
        _fields.push(field.fieldName);
        // A poly is basically multiple m2os glued together, so copy/paste the `case m2o` code
        // above but do it for each component FK, and glue them together.
        return field.components.flatMap((comp) => {
          return reverseReactiveHint(rootType, comp.otherMetadata().cstr, subHint, undefined, false, false).map(
            appendPath(maybeAddTypeFilterSuffix(meta, comp)),
          );
        });
      }
      case "m2m": {
        // While o2m and o2o can watch for just FK changes by passing `reactForOtherSide` (the FK lives in the other
        // table), for m2m reactivity we push the collection name into the reactive hint, because it's effectively
        // "the other/reverse side", and JoinRows will trigger `queueDownstreamReactables` explicitly, instead of
        // `setField` which handles regular/non-m2m mutations.
        fields.push(field.fieldName);
        const otherFieldName = maybeAddTypeFilterSuffix(meta, field);
        return reverseReactiveHint(
          rootType,
          field.otherMetadata().cstr,
          subHint,
          // For m2m, we can always pass undefined here, as otherwise having the opposite m2m collection
          // recalc all of its children will cause over-reactivity
          undefined,
          false,
          false,
        ).map(appendPath(otherFieldName));
      }
      case "o2m":
      case "o2o": {
        const isOtherReadOnly = field.otherMetadata().allFields[field.otherFieldName].immutable;
        const otherFieldName = maybeAddTypeFilterSuffix(meta, field);
        // This is not a field, but we want our reverse side to be reactive, so pass reactForOtherSide
        return reverseReactiveHint(
          rootType,
          field.otherMetadata().cstr,
          subHint,
          // IsLoadedCache invalidation always needs to know the otherField name, so we must
          // end up with either a kind=update or kind=read-only target with `otherFieldName` in it.
          field.otherFieldName,
          // We can have three outcomes:
          // - kind=update fields=[otherFieldName] (normal behavior)
          // - kind=update fields=[] + kind=read-only fields=[otherFieldName] (isOtherReadOnly)
          // - kind=read-only fields=[otherFieldName] (hint isReadOnly)
          isReadOnly ? "hint-read-only" : isOtherReadOnly ? "field-read-only" : false,
          false,
        ).map(appendPath(otherFieldName));
      }
      case "primaryKey":
      case "primitive":
      case "enum":
        _fields.push(key);
        return [];
      default:
        throw new Error(`Invalid hint in ${rootType.name}.ts hint ${JSON.stringify(hint)}`);
    }
  } else {
    // We only need to look for ReactiveAsyncProperties here, because ReactiveFields & ReactiveReferences
    // have underlying primitive fields that, when/if they change, will be handled in the ^ code.
    //
    // I.e. we specifically don't need to handle RFs & RRs ^, because the EntityManager.flush loop will
    // notice their primitive values changing, and kicking off any downstream reactive fields as necessary.
    const p = getProperties(meta)[key];
    if (p instanceof AsyncPropertyImpl) {
      // If the field is marked as readonly (i.e. using the `_ro` suffix), then we can assume that applies to its
      // entire hint as well and can simply omit it. This also allows us to use non-reactive async props as long as
      // they are readonly.
      if (isReadOnly) return [];
      if (!p.reactiveHint) {
        throw new Error(
          `AsyncProperty ${key} cannot be used in reactive hints in ${rootType.name}.ts hint ${JSON.stringify(
            hint,
          )}, please use hasReactiveAsyncProperty instead`,
        );
      }
      return reverseReactiveHint(rootType, meta.cstr, p.reactiveHint, undefined, false, false);
    } else if (p instanceof ReactiveGetterImpl) {
      // If the field is marked as readonly, then we can assume that applies to its entire hint as well and can
      // simply omit it.
      if (isReadOnly) return [];
      return reverseReactiveHint(rootType, meta.cstr, p.reactiveHint, undefined, false, false);
    } else if (p instanceof RecursiveParentsCollectionImpl) {
      // I.e. if this is `Author.mentorsRecursive`:
      // - fieldName=mentorsRecursive (being watched by the caller)
      // - otherFieldName=menteesRecursive (our reversal for walking down)
      // - m2oFieldName = mentor
      //
      // Note that "reversing parents" is generally easier, b/c when the tree changes, any given node can
      // still "walk down" to find its children w/the "current value" childrenRecursive; and any just-now
      // orphaned parents will themselves trigger their own childrenRecursive changes (i.e. we do not need
      // any "old reference value" / "new reference value" handling).
      //
      // I.e. given a tree of `A is mentor of B is mentor of C`, when B changes mentors, and we need to
      // "walk to all affected/children mentees, so they can observe their new mentorsRecursive", merely
      // walking down from (b itself & it's mentees) will find all affected mentees.
      const { otherFieldName, m2oFieldName } = p;
      // When a mentor.firstName/etc field changes, walk to its transitive children (through otherFieldName)
      // via the `return reverseReactiveHint` line below.
      //
      // But if the `author.mentor` field itself changes, we ourselves are also "a new mentee" of the mentor, so
      // do `fields.push(m2oFieldName)` to notify our direct reactable (a new mentee), and then our transitive
      // children/mentees. This avoids going "up to the mentor, and walking down all of his mentees", which would go
      // through our siblings, which would not have changed/need reactivity.
      _fields.push(m2oFieldName);
      maybeRecursive.push({
        kind: isReadOnly ? "read-only" : "update",
        entity: entityType,
        fields: [m2oFieldName],
        path: [otherFieldName],
      });
      // Any reactables who were watching `parentsRecursive`, we'll back down to by going through `childrenRecursive`
      return reverseReactiveHint(rootType, entityType, subHint, undefined, false).map(appendPath(otherFieldName));
    } else if (p instanceof RecursiveChildrenCollectionImpl) {
      const { otherFieldName, o2mFieldName } = p;
      // I.e. this is `Author.menteesRecursive`
      // - fieldName=menteesRecursive` (being watched by the caller)
      // - otherFieldName=mentorsRecursive` (our reversal for walking up)
      // - The o2m's otherFieldName gives us the FK field (e.g., "mentor") on the child entity.
      //
      // Note that "reversing children" is trickier than reversing parents, b/c when the tree changes,
      // we need to consider both "old reference value" and "new reference value" scenarios.
      const o2mField = meta.allFields[o2mFieldName] as OneToManyField | OneToOneField;
      const m2oFieldName = o2mField.otherFieldName;
      _fields.push(m2oFieldName);
      maybeRecursive.push({
        kind: isReadOnly ? "read-only" : "update",
        entity: entityType,
        fields: [m2oFieldName], // i.e. parent
        path: [otherFieldName], // i.e. parentsRecursive to tell them "observe your new childrenRecursive"
      });
      // Any reactables who were watching `childrenRecursive`, we'll up to by going through `parentsRecursive`
      return reverseReactiveHint(rootType, entityType, subHint, undefined, false).map(appendPath(otherFieldName));
    } else if (p instanceof RecursiveM2mCollectionImpl) {
      // I.e. if this is `User.parentsRecursive`:
      // - fieldName=parentsRecursive (being watched by the caller)
      // - otherFieldName=childrenRecursive (our reversal for walking down)
      // - m2mFieldName=parents (the underlying m2m collection)
      //
      // For m2m recursive, the "change signal" is when join rows are added/removed, so we push
      // the m2m collection name into fields (like regular m2m handling). To find affected entities
      // that are watching `parentsRecursive`, we walk through `childrenRecursive` (the reverse direction).
      const { otherFieldName, m2mFieldName } = p;
      // When a join row changes (e.g. parents collection is mutated), notify both this entity
      // and its transitive children/parents via otherFieldName
      fields.push(m2mFieldName);
      maybeRecursive.push({
        kind: isReadOnly ? "read-only" : "update",
        entity: entityType,
        fields: [m2mFieldName],
        path: [otherFieldName],
      });
      // Any reactables who were watching this recursive collection, we'll reach via the other direction
      return reverseReactiveHint(rootType, entityType, subHint, undefined, false).map(appendPath(otherFieldName));
    } else {
      throw new Error(`Invalid hint in ${rootType.name}.ts ${JSON.stringify(hint)}`);
    }
  }
}

function maybeAddTypeFilterSuffix(
  meta: EntityMetadata,
  field: ManyToOneField | OneToManyField | ManyToManyField | OneToOneField | PolymorphicFieldComponent,
): string {
  const otherField = field.otherMetadata().allFields[field.otherFieldName];
  if (!otherField) {
    // This is usually an error, unless if its ReactiveReference which we don't create o2m-s for
    const isReactiveReference = "kind" in field && field.kind === "m2o" && field.derived === "async";
    if (!isReactiveReference) fail(`No field ${field.otherMetadata().type}.${field.otherFieldName}`);
    return field.otherFieldName;
  }
  // If we're Foo, and the other field (which we'll traverse back from at runtime) is actually
  // a poly FK pointing back to multiple `owner=Foo | Bar | Zaz`, add a suffix of `@Foo` so
  // that any runtime traversal that hit `owner` and see a `Bar | Zaz` will stop.
  const nextFieldIsPoly = otherField.kind === "poly";
  // If we're a SubType, and the other field points to our base type, assume there might be
  // SubType-specific fields in the path so far, so tell the other side to only walk back through
  // us if its value is actually a SubType.
  const nextFieldPointsToBaseType =
    !!meta.baseType && otherField.kind !== "poly" && (otherField as any).otherMetadata().cstr !== meta.cstr;
  return nextFieldIsPoly || nextFieldPointsToBaseType ? `${field.otherFieldName}@${meta.type}` : field.otherFieldName;
}

/**
 * Walks `reverseHint` for every entity in `entities`.
 *
 * I.e. given `[book1, book2]` and `["author", 'publisher"]`, will return all the books' authors' publishers.
 *
 * Note that for references (and only references), we walk both through "the current value"
 * and "the original value". This is fundamentally because references are the true "owner"
 * of the relation, while collections are derived.
 *
 * For example, with reversals walking through collections:
 *
 * - Given a hint `book: { author: firstName }`
 * - Which reverses to `author[firstName] -> books`
 * - When we walk through `a1.books`, we use only the current value, which might have only `[b2]` in it.
 * - We don't need to worry about "the old a1.books" value, which might have previously had `[b1]` in it,
 *   because the `b1.author` changing authors (from `a1` to `a2`) will trigger its own reactivity.
 *
 * Contrast with reversals walking through references:
 *
 * - Given a hint `author: { books: "title" }`
 * - Which reverses to `book[title] -> author`
 * - When we traverse through `b1.author`, we use both the current value and original value, so that both
 *   "our prior author" and "our new author" see their latest `author.books` collection values.
 */
export async function followReverseHint(
  reactionName: string,
  entities: Entity[],
  reverseHint: string[],
): Promise<Entity[]> {
  // Start at the current (unique) entities
  let current = new Set(entities);
  const paths = [...reverseHint];
  // And "walk backwards" through the reverse hint
  while (paths.length) {
    const path = paths.shift()!;
    const [fieldName, viaType] = path.split("@");
    const promises = new Array(current.size);
    // The path might touch either a reference or a collection
    for (const c of current as Set<any>) {
      const relation = c[fieldName];
      // If `!relation`, I'd really like to `fail`, but atm we're knowingly creating invalid reversals for when
      // a ReactiveField depends on a ReactiveReference; b/c RRs lack an "other side", we cannot walk them in
      // reverse, and so for awhile we "supported" the RF -> RR pattern by relying on a totally-read-only reactive
      // hint -> dropped during reversal.
      //
      // However, now IsLoadedCache means that even these "totally read only" RFs need to be reactive at least
      // during their initial EM creation, to avoid stale values being observed during first-flush mutations,
      // and so we're now stuck with these "invalid RR reversals" until we can figure out a better way to handle them.
      // (Now that IsLoadedCache doesn't technically walk paths, it just invalidates given entity+field pairs, so
      // it is not bothered by an invalid/missing RR reversal.)
      if (!relation) continue;
      // fail(`Attempting to react for ${reactionName} for ${c.toString()}, but there is no "reverse walkable" field ${c.constructor.name}.${fieldName}`,);
      const currentValuePromise = maybeApplyTypeFilter(relation.load(), viaType);
      // Always wait for the relation itself
      promises.push(currentValuePromise);
      // If we're going from Book.author back to Author to re-validate the Author.books collection,
      // see if Book.author has changed, so we can re-validate both the old author's books and the
      // new author's books.
      const fieldKind = getMetadata(c).fields[fieldName]?.kind;
      const isReference = fieldKind === "m2o" || fieldKind === "poly";
      const isManyToMany = fieldKind === "m2m";
      const changed = isChangeableField(c, fieldName) ? (c.changes[fieldName] as FieldStatus<any>) : undefined;
      // See jsdoc comment about why this is only necessary for references...
      if (isReference && changed && changed.hasUpdated && changed.originalValue) {
        promises.push(maybeApplyTypeFilter((changed as ManyToOneFieldStatus<any>).originalEntity, viaType));
      }
      if (isManyToMany) {
        const m2m = c[fieldName] as ManyToManyCollection<any, any>;
        const joinRows = getEmInternalApi(m2m.entity.em).joinRows(m2m);
        // Return a tuple of [currentRows, removedRows]
        promises.push(joinRows.removedFor(m2m, c));
      }
      // Walk up the old parents
      if (relation instanceof RecursiveParentsCollectionImpl) {
        const { m2oFieldName } = relation;
        const changed = isChangeableField(c, m2oFieldName) ? (c.changes[m2oFieldName] as FieldStatus<any>) : undefined;
        if (changed && changed.hasUpdated && changed.originalValue) {
          promises.push(
            // First load the original parent itself
            (changed as ManyToOneFieldStatus<any>).originalEntity.then((oldParent) => {
              // And then resolve its fieldName=parentsRecursive
              const oldParentRecursiveParents = (oldParent as any)[fieldName];
              return oldParentRecursiveParents.load().then((parents: any) => {
                return [oldParent, ...parents];
              });
            }),
          );
        }
      }
    }
    const nextLevel = await Promise.all(promises);
    // Make a new set so that we dedupe as we go
    current = flatAndUnique(nextLevel);
  }
  return [...current];
}

/** Converts a normalized reactive `hint` into a load hint. */
export function convertToLoadHint<T extends Entity>(
  meta: EntityMetadata,
  hint: ReactiveHint<T>,
  allowCustomKeys = false,
): LoadHint<T> {
  const loadHint = {};
  // Process the hints individually instead of just calling Object.fromEntries so that
  // we can handle inlined reactive hints that overlap.
  for (const [keyMaybeSuffix, subHint] of Object.entries(normalizeHint(hint))) {
    let key = keyMaybeSuffix.replace(suffixRe, "");
    let field = meta.allFields[key];

    // If `allowCustomKeys` is enabled, we're probably doing `toJSON`,
    // so look for `companyId` & `companyIds` to turn into `company`
    if (!field && allowCustomKeys) {
      const realField = Object.values(meta.allFields).find((f) => f.fieldIdName === key);
      if (realField) {
        field = realField;
        key = realField.fieldName;
      }
    }

    if (field) {
      switch (field.kind) {
        case "m2m":
        case "m2o":
        case "o2m":
        case "o2o":
          mergeNormalizedHints(loadHint, { [key]: convertToLoadHint(field.otherMetadata(), subHint, allowCustomKeys) });
          break;
        case "poly":
          for (const comp of field.components) {
            // Write `{ parent: { child@Type: hint } }` into the load hint
            mergeNormalizedHints(loadHint, {
              [key]: Object.fromEntries(
                Object.entries(convertToLoadHint(comp.otherMetadata(), subHint, allowCustomKeys)).map(
                  // Map the subHint keys to add in `@Type`
                  ([subKey, subHint]) => [`${subKey}@${comp.otherMetadata().type}`, subHint],
                ),
              ),
            });
          }
          break;
        case "primitive":
        case "enum":
          if (field.derived === "async") {
            mergeNormalizedHints(loadHint, { [key]: {} });
          }
          continue;
        case "primaryKey":
          continue;
        default:
          throw new Error(`Invalid reactive hint ${meta.tableName} ${JSON.stringify(hint)}`);
      }
    } else {
      const p = getProperties(meta)[key];
      if (p instanceof RecursiveParentsCollectionImpl) {
        mergeNormalizedHints(loadHint, { [p.fieldName]: convertToLoadHint(meta, subHint, allowCustomKeys) });
      } else if (p instanceof RecursiveChildrenCollectionImpl) {
        mergeNormalizedHints(loadHint, { [p.fieldName]: convertToLoadHint(meta, subHint, allowCustomKeys) });
      } else if (p instanceof RecursiveM2mCollectionImpl) {
        mergeNormalizedHints(loadHint, { [p.fieldName]: convertToLoadHint(meta, subHint, allowCustomKeys) });
      } else if (p && p.reactiveHint) {
        mergeNormalizedHints(loadHint, convertToLoadHint(meta, p.reactiveHint, allowCustomKeys));
      } else if (!allowCustomKeys) {
        fail(`Invalid reactive hint on ${meta.tableName} ${JSON.stringify(hint)}`);
      }
    }
  }
  return loadHint as any;
}

/** An entity that, when `fields` change, should trigger the reactive rule/field pointed to by `path`. */
export interface ReactiveTarget {
  kind: "read-only" | "update";
  /** The entity that contains a field our reactive rule/field accesses. */
  entity: MaybeAbstractEntityConstructor<any>;
  /** The field(s) that our reactive rule/field accesses, plus any implicit fields like FKs. */
  fields: string[];
  /** The path from this `entity` back to the source reactive rule/field. */
  path: string[];
}

function maybeApplyTypeFilter(loadPromise: Promise<Entity | Entity[]>, viaType: string | undefined) {
  if (viaType) {
    return loadPromise.then((loaded) => {
      if (Array.isArray(loaded)) {
        return loaded.filter((e) => isTypeOrSubType(e, viaType));
      } else if (loaded && isTypeOrSubType(loaded, viaType)) {
        return loaded;
      } else {
        return undefined;
      }
    });
  }
  return loadPromise;
}

/** Handle `viaType` filtering with subtype awareness. */
function isTypeOrSubType(entity: Entity, typeName: string): boolean {
  const meta = getMetadata(entity);
  // Easy check for the name is the same
  if (meta.type === typeName) return true;
  // Otherwise see if the entity is a subtype of the typeName, i.e. if our poly/type
  // filter is `@Publisher`, and we're a `SmallPublisher`, that's valid to traverse.
  for (const other of getSubMetas(getMetadataForType(typeName))) {
    if (other.type === typeName) return true;
  }
  return false;
}

export function isPolyHint(key: string): boolean {
  return key.includes("@");
}

export function splitPolyHintToKeyAndType(key: string): [string, string] {
  const [k, type] = key.split("@");
  return [k, type];
}

/** If this hint is a poly like `author@Book`, return the type, otherwise return undefined. */
export function getRelationFromMaybePolyKey(entity: Entity, key: string): any {
  if (isPolyHint(key)) {
    const [realKey, typeName] = splitPolyHintToKeyAndType(key);
    // Even though `entity[realKey]` might exist, if it's from a different poly type, we don't want it
    const isApplicable = getBaseAndSelfMetas(getMetadata(entity)).some((meta) => meta.type === typeName);
    if (!isApplicable) return undefined;
    return (entity as any)[realKey];
  } else {
    return (entity as any)[key];
  }
}

/**
 * For an `author -> books -> bookReviews` hint, appends `BookReview.book`, `Book.author`,
 * i.e. the "other side" relation, to the reversed path on the way "out" from a mutated BookReview
 * to the target `Author` RF/RR/rule.
 */
function appendPath(reverseField: string): (rt: ReactiveTarget) => ReactiveTarget {
  return (rt) => {
    // We can mutate this array b/c it's only owned by a single/continually-updated `ReactiveTarget`
    rt.path = [...rt.path, reverseField];
    return rt;
  };
}

function isAllReadOnly(hint: any): boolean {
  for (const [key, subHint] of Object.entries(normalizeHint(hint))) {
    const okay = (key.endsWith("_ro") || key.endsWith(":ro")) && isAllReadOnly(subHint);
    if (!okay) return false;
  }
  return true;
}
