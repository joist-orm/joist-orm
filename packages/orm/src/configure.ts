import { Entity } from "./Entity";
import { MaybeAbstractEntityConstructor, TaggedId } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { setBooted } from "./config";
import { hasDefaultValue } from "./defaults";
import { getFakeInstance } from "./getProperties";
import { maybeResolveReferenceToId, tagFromId } from "./keys";
import { reverseReactiveHint } from "./reactiveHints";
import { ReactiveReferenceImpl, Reference } from "./relations";
import { ReactiveFieldImpl } from "./relations/ReactiveField";
import { ReactiveQueryFieldImpl } from "./relations/ReactiveQueryField";
import { isCannotBeUpdatedRule } from "./rules";

const tagToConstructorMap = new Map<string, MaybeAbstractEntityConstructor<any>>();
const tableToMetaMap = new Map<string, EntityMetadata>();

/** Performs our boot-time initialization, i.e. hooking up reactivity. */
export function configureMetadata(metas: EntityMetadata[]): void {
  setBooted();
  populateConstructorMaps(metas);
  ensureDefaultsSet(metas);
  setImmutableFields(metas);
  hookUpBaseTypeAndSubTypes(metas);
  reverseIndexReactivity(metas);
}

export function getConstructorFromTaggedId(id: TaggedId): MaybeAbstractEntityConstructor<any> {
  const tag = tagFromId(id);
  return tagToConstructorMap.get(tag) ?? fail(`Unknown tag: "${tag}" `);
}

export function getMetadataForTable(tableName: string): EntityMetadata {
  return tableToMetaMap.get(tableName) ?? fail(`Unknown table ${tableName}`);
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
    if (!meta.baseType) tagToConstructorMap.set(meta.tagName, meta.cstr);
    // Same for tables, but include subclass tables
    tableToMetaMap.set(meta.tableName, meta);
  }
}

// Do a first pass to flag immutable fields (which we'll use in reverseReactiveHint)
function setImmutableFields(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    // Scan rules for cannotBeUpdated so that we can set `field.immutable`
    meta.config.__data.rules.forEach((rule) => {
      if (isCannotBeUpdatedRule(rule.fn) && rule.fn.immutable) {
        const field = meta.fields[rule.fn.field];
        if (!field) {
          throw new Error(`Missing field '${rule.fn.field}' for cannotBeUpdated at ${rule.name}`);
        }
        field.immutable = true;
      }
    });
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
        m.allFields[name] = { ...field, aliasSuffix: b.inheritanceType === "cti" ? "_b0" : "" };
      });
    }
  }
}

// Now hook up our reactivity
function reverseIndexReactivity(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    // Look for reactive validation rules to reverse
    meta.config.__data.rules.forEach(({ name, hint, fn }) => {
      if (hint) {
        const reversals = reverseReactiveHint(meta.cstr, meta.cstr, hint);
        // For each reversal, tell its config about the reverse hint to force-re-validate
        // the original rule's instance any time it changes.
        reversals.forEach(({ entity, path, fields }) => {
          getMetadata(entity).config.__data.reactiveRules.push({
            source: entity,
            cstr: meta.cstr,
            name,
            fields,
            path,
            fn,
          });
        });
      }
    });

    // Look for ReactiveFields to reverse
    Object.values(meta.fields)
      .filter(
        (f) =>
          f.kind === "primitive" ||
          (f.kind === "m2o" && f.derived === "async") ||
          (f.kind === "enum" && f.derived === "async"),
      )
      .forEach((field) => {
        const ap = (getFakeInstance(meta) as any)[field.fieldName] as
          | ReactiveFieldImpl<any, any, any>
          | ReactiveQueryFieldImpl<any, any, any, any>
          | ReactiveReferenceImpl<any, any, any, any>
          | undefined;
        // We might have an async property configured in joist-config.json that has not yet
        // been made a `hasReactiveField` in the entity file, so avoid continuing
        // if we don't actually have a property/loadHint available.
        if (ap?.reactiveHint) {
          const reversals = reverseReactiveHint(meta.cstr, meta.cstr, ap.reactiveHint);
          reversals.forEach(({ entity, path, fields }) => {
            getMetadata(entity).config.__data.reactiveDerivedValues.push({
              kind: ap instanceof ReactiveQueryFieldImpl ? "query" : "populate",
              cstr: meta.cstr,
              name: field.fieldName,
              path,
              fields,
            });
          });
        }
      });
  }
}

/** If the joist-config.json says a field has a `setDefault` call, make sure it does. */
function ensureDefaultsSet(metas: EntityMetadata[]): void {
  for (const meta of metas) {
    for (const field of Object.values(meta.fields)) {
      if ("hasConfigDefault" in field && !hasDefaultValue(meta, field.fieldName)) {
        throw new Error(`Field ${meta.type}.${field.fieldName} is missing config.setDefault call`);
      }
    }
  }
}
