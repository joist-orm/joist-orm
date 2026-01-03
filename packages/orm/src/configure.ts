import { Entity } from "./Entity";
import { MaybeAbstractEntityConstructor, TaggedId } from "./EntityManager";
import { EntityMetadata, ManyToOneField, OneToManyField, getMetadata } from "./EntityMetadata";
import { setAfterMetadataLocked, setBooted } from "./config";
import { AsyncDefault } from "./defaults";
import { getProperties } from "./getProperties";
import { maybeResolveReferenceToId, tagFromId } from "./keys";
import { reverseReactiveHint } from "./reactiveHints";
import { ReactiveReferenceImpl, Reference } from "./relations";
import { ReactiveCollectionImpl } from "./relations/ReactiveCollection";
import { ReactiveFieldImpl } from "./relations/ReactiveField";
import { ReactiveQueryFieldImpl } from "./relations/ReactiveQueryField";
import { isCannotBeUpdatedRule } from "./rules";
import { KeySerde } from "./serde";
import { fail } from "./utils";

const tagToConstructorMap = new Map<string, MaybeAbstractEntityConstructor<any>>();
const tableToMetaMap = new Map<string, EntityMetadata>();
const typeToMetaMap = new Map<string, EntityMetadata>();

let previousBootError: any;

/** Performs our boot-time initialization, i.e. hooking up reactivity. */
export function configureMetadata(metas: EntityMetadata[]): void {
  // Add explicit "did we already fail" check b/c if a transformer like tsx gets a runtime error from
  // here, it can potentially suppress it, move on to another file, which will naively re-invoke
  // `configureMetadata` again, and fail with a very confusing "Duplicate tag" error
  if (previousBootError) {
    throw previousBootError;
  }
  try {
    populateConstructorMaps(metas);
    hookUpBaseTypeAndSubTypes(metas);
    sortMetasByBaseType(metas);
    setImmutableFields(metas);
    populatePolyComponentFields(metas);
    fireAfterMetadatas(metas);
    // Callers can make `config` calls during `afterMetadata` callbacks, but after that
    // we don't allow any more config changes.
    setBooted();
    // Do these after `fireAfterMetadatas`, in case afterMetadata callbacks added more defaults/rules
    copyAsyncDefaults(metas);
    reverseIndexReactivity(metas);
    copyRunBeforeBooksToBaseType(metas);
  } catch (e) {
    previousBootError = e;
    throw e;
  }
}

// Sort metas in place by inheritance hierarchy so that the base type comes before subtypes
function sortMetasByBaseType(metas: EntityMetadata[]): void {
  metas.sort(compareMetasByBaseType);
}

// Compare metas by inheritance hierarchy so that the base type sorts before subtypes
function compareMetasByBaseType(a: EntityMetadata, b: EntityMetadata): number {
  if (a.baseTypes.length > 0 && b.baseTypes.length === 0) return 1;
  if (a.baseTypes.length === 0 && b.baseTypes.length > 0) return -1;
  if (a.baseTypes.some((baseType) => baseType === b)) return 1;
  if (b.baseTypes.some((baseType) => baseType === a)) return -1;
  return a.type.localeCompare(b.type);
}

function fireAfterMetadatas(metas: EntityMetadata[]): void {
  setAfterMetadataLocked();
  for (const meta of metas) {
    for (const fn of meta.config.__data.afterMetadataCallbacks) fn(meta);
  }
}

export function resetConstructorMap(): void {
  tagToConstructorMap.clear();
}

export function getConstructorFromTag(tag: string): MaybeAbstractEntityConstructor<any> {
  return tagToConstructorMap.get(tag) ?? fail(`Unknown tag: "${tag}" `);
}

export function getConstructorFromTaggedId(id: TaggedId): MaybeAbstractEntityConstructor<any> {
  const tag = tagFromId(id);
  return getConstructorFromTag(tag);
}

export function getMetadataForTable(tableName: string): EntityMetadata {
  return tableToMetaMap.get(tableName) ?? fail(`Unknown table ${tableName}`);
}

export function getMetadataForType(typeName: string): EntityMetadata {
  return typeToMetaMap.get(typeName) ?? fail(`Unknown type ${typeName}`);
}

export function maybeGetConstructorFromReference(
  value: string | Entity | Reference<any, any, any> | undefined,
): MaybeAbstractEntityConstructor<any> | undefined {
  const id = maybeResolveReferenceToId(value);
  return id ? getConstructorFromTaggedId(id) : undefined;
}

function populateConstructorMaps(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    // Add each (root) constructor into our tag -> constructor map for future lookups
    if (!meta.baseType) {
      const existing = tagToConstructorMap.get(meta.tagName);
      if (existing) throw new Error(`Duplicate tag '${meta.tagName}' for ${meta.type} and ${existing.name}`);
      tagToConstructorMap.set(meta.tagName, meta.cstr);
    }
    // Same for tables, but include subclass tables
    tableToMetaMap.set(meta.tableName, meta);
    typeToMetaMap.set(meta.type, meta);
  }
}

// Do a first pass to flag immutable fields (which we'll use in reverseReactiveHint)
function setImmutableFields(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    // Scan rules for cannotBeUpdated so that we can set `field.immutable`
    for (const rule of meta.config.__data.rules) {
      if (isCannotBeUpdatedRule(rule.fn) && rule.fn.immutable) {
        // Usually the field will exist directly in meta.fields
        const selfField = meta.fields[rule.fn.field];
        // Or it might have come in from a base type in meta.allFields
        const baseField = meta.allFields[rule.fn.field];
        // Either way, at least one should exist
        if (!selfField && !baseField) {
          throw new Error(`Missing field '${meta.type}.${rule.fn.field}' for cannotBeUpdated at ${rule.name}`);
        }
        if (selfField) selfField.immutable = true;
        if (baseField) baseField.immutable = true;
      }
    }
  }
}

// Setup subTypes/baseTypes
function hookUpBaseTypeAndSubTypes(metas: EntityMetadata[]): void {
  const metaByName = metas.reduce(
    (acc, m) => {
      acc[m.type] = m;
      return acc;
    },
    {} as Record<string, EntityMetadata>,
  );
  for (const m of metas) {
    // This is basically m.fields.mapValues to assign the primary alias
    m.allFields = Object.fromEntries(
      Object.entries(m.fields).map(([name, field]) => [name, { ...field, aliasSuffix: "" }]),
    );
    // Only supporting one level of inheritance for now, ideally would loop `while current !== null`
    if (m.baseType) {
      const b = metaByName[m.baseType];
      m.baseTypes.push(b);
      b.subTypes.push(m);
      // Add all the base's fields to our allFields, with the base's aliasSuffix, so that in
      // `WHERE` clauses for `small_publishers`, we'll have joined in `publishers` with an
      // alias + this alias suffix, so can `WHERE` on `${alias}_b0.name = 'foo'` and get
      // to the correct table.
      //
      // Note that we don't need to do this for subtypes, because `em.find` queries aren't
      // allowed to `WHERE` against columns in their subtypes. Maybe someday we can support
      // that like the GraphQL `...on SmallPublisher` syntax, like conditional/subtype-specific
      // clauses.
      Object.entries(b.fields).forEach(([name, field]) => {
        // We use `b0` because that is what addTablePerClassJoinsAndClassTag uses to join in the base table
        const aliasSuffix = b.inheritanceType === "cti" ? "_b0" : "";
        if (name in m.allFields && name !== "id") {
          // If the base field (i.e. group) is already in `m.allFields`, it's from a CTI subtype specializing
          // a base field (i.e. `SmallPublisher.group`), in which case we don't really want it inserted/updated
          // in the `small_publishers` table itself, so we'll delete it from `m.fields`, *but* leave it in
          // m.allFields, with appropriate/overridden `otherEntity: SmallPublisherGroup` config so that it
          // can be used to reverse validation rules/RFs.
          delete m.fields[name];
          m.allFields[name].aliasSuffix = aliasSuffix;
        } else {
          m.allFields[name] = { ...field, aliasSuffix };
        }
      });
    }
  }
}

/** Copy/pastes base AsyncDefaults onto subtypes, so that subtypes can have their own default dependencies. */
function copyAsyncDefaults(metas: EntityMetadata[]): void {
  for (const m of metas) {
    for (const b of m.baseTypes) {
      // Clone in the base asyncDefaults, unless we override our own
      for (const [fieldName, df] of Object.entries(b.config.__data.asyncDefaults)) {
        if (!m.config.__data.asyncDefaults[fieldName]) {
          // Given our subtype its own instance, because we might have different default dependencies.
          // I.e. from a sample domain model, something like:
          // - The base `PlanVersion.type` default depends on `{ identity: "type" }`
          // - The base `Plan.type` has no default itself
          // - The sub `SpecialPlanVersion` inherits type, and specializes `SPV.identity: SP`
          // - The sub `SpecialPlan.type` does have a default
          //
          // So we need to eval `PlanVersion.type` separately from `SpecialPlanVersion.type`, even
          // though they come from the same `config.setDefault` call/lambda in `PlanVersion.ts`.
          m.config.__data.asyncDefaults[fieldName] = new AsyncDefault(df.fieldName, df.fieldHint, df.fn);
        }
      }
    }
  }
}

// Now hook up our reactivity
function reverseIndexReactivity(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    // Look for reactive validation rules to reverse
    for (const { name, hint, fn } of meta.config.__data.rules) {
      if (hint) {
        const reversals = reverseReactiveHint(meta.cstr, meta.cstr, hint);
        // For each reversal, tell its config about the reverse hint to force-re-validate
        // the original rule's instance any time it changes.
        for (const { kind, entity, path, fields } of reversals) {
          if (kind === "update") {
            getMetadata(entity).config.__data.reactiveRules.push({
              source: entity,
              cstr: meta.cstr,
              name,
              fields,
              path,
              fn,
            });
          }
        }
      }
    }

    // Look for reactions to reverse
    for (const { name, hint, fn, runOnce } of meta.config.__data.reactions) {
      const reversals = reverseReactiveHint(meta.cstr, meta.cstr, hint);
      // For each reversal, tell its config about the reverse hint to force-rerun
      // the original reaction's instance any time it changes.
      for (const { kind, entity, path, fields } of reversals) {
        getMetadata(entity).config.__data.reactables.push({
          kind: "reaction",
          source: entity,
          cstr: meta.cstr,
          isReadOnly: kind === "read-only",
          name,
          fields,
          path,
          fn,
          runOnce,
        });
      }
    }

    // Look for ReactiveFields to reverse
    const reactiveFields = Object.values(meta.allFields).filter(
      (f) =>
        f.kind === "primitive" ||
        (f.kind === "m2o" && f.derived === "async") ||
        (f.kind === "enum" && f.derived === "async") ||
        (f.kind === "m2m" && f.derived === "async"),
    );
    for (const field of reactiveFields) {
      const ap = (getProperties(meta) as any)[field.fieldName] as
        | ReactiveFieldImpl<any, any, any>
        | ReactiveQueryFieldImpl<any, any, any, any>
        | ReactiveReferenceImpl<any, any, any, any>
        | ReactiveCollectionImpl<any, any, any>
        | undefined;
      // We might have an async property configured in joist-config.json that has not yet
      // been made a `hasReactiveField` in the entity file, so avoid continuing
      // if we don't actually have a property/loadHint available.
      if (ap?.reactiveHint) {
        const reversals = reverseReactiveHint(meta.cstr, meta.cstr, ap.reactiveHint);
        for (const { kind, entity, path, fields } of reversals) {
          getMetadata(entity).config.__data.reactables.push({
            kind: ap instanceof ReactiveQueryFieldImpl ? "query" : "populate",
            cstr: meta.cstr,
            isReadOnly: kind === "read-only",
            name: field.fieldName,
            path,
            fields,
            runOnce: false,
          });
        }
      }
    }
  }
}

/**
 * In addition to the canonical `meta.allFields`, we populate a `meta.polyComponentFields` to
 * disaggregates the poly's components into individual fields so that `em.find` / `parseFindQuery`
 * can support component-specific find queries.
 */
function populatePolyComponentFields(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    for (const [key, field] of Object.entries(meta.allFields)) {
      if (field.kind === "poly") {
        meta.polyComponentFields ??= {};
        for (const comp of field.components) {
          const fieldName = `${key}${comp.otherMetadata().type}`;
          // Synthesize a m2o component that won't be used for any actual read/write serde,
          // but just to help `parseFindQuery` build `WHERE` clauses.
          meta.polyComponentFields[fieldName] = {
            kind: "m2o",
            fieldName,
            fieldIdName: `${fieldName}Id`,
            required: false,
            immutable: false,
            derived: false,
            serde: new KeySerde(
              comp.otherMetadata().tagName,
              fieldName,
              comp.columnName,
              field.serde.columns[0].dbType as any,
            ),
            ...comp,
            aliasSuffix: field.aliasSuffix,
          } satisfies ManyToOneField & { aliasSuffix: string };
        }
      } else if (field.kind === "m2o") {
        field.otherMetadata().subTypes.forEach((st) => {
          const fieldName = `${key}${st.type}`;
          meta.polyComponentFields ??= {};
          meta.polyComponentFields[fieldName] = {
            ...field,
            // a subtype specific sub-field (i.e. `publisherLargePublishers`) cannot be required (which turns into
            // an `inner join`), even if its parent is, since it won't always be present (i.e. the pointed-at publisher
            // might be a small publisher).
            required: false,
            fieldName,
            fieldIdName: `${fieldName}Id`,
            otherMetadata: () => st,
          } satisfies ManyToOneField & { aliasSuffix: string };
        });
      } else if (field.kind === "o2m") {
        field.otherMetadata().subTypes.forEach((st) => {
          const fieldName = `${key}${st.type}`;
          meta.polyComponentFields ??= {};
          meta.polyComponentFields[fieldName] = {
            ...field,
            fieldName,
            fieldIdName: `${fieldName}Id`,
            otherMetadata: () => st,
          } satisfies OneToManyField & { aliasSuffix: string };
        });
      }
    }
  }
}

function copyRunBeforeBooksToBaseType(meta: EntityMetadata[]): void {
  for (const m of meta) {
    for (const b of m.baseTypes) {
      b.config.__data.runHooksBefore.push(...m.config.__data.runHooksBefore);
    }
  }
}
