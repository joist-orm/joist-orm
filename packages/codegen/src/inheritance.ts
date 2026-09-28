import { type Config } from "./config.ts";
import {
  type DbMetadata,
  type EntityDbMetadata,
  type ManyToManyField,
  type ManyToOneField,
  type PolymorphicFieldComponent,
  canonicalizeOtherEntities,
  makeEntity,
} from "./EntityDbMetadata.ts";
import { fail } from "./utils.ts";

/** Preserves physical storage metadata, then applies domain inheritance specialization. */
export function applyInheritanceUpdates(config: Config, db: DbMetadata): void {
  const { entities, entitiesByName } = db;
  // Preserve storage domains before STI moves fields or rewrites relationship targets.
  for (const meta of entities) {
    meta.physicalMetadata = {
      ...meta,
      name: meta.name,
      primitives: meta.primitives.map((field) => ({ ...field })),
      enums: meta.enums.map((field) => ({ ...field })),
      pgEnums: meta.pgEnums.map((field) => ({ ...field })),
      manyToOnes: meta.manyToOnes.map((field) => ({ ...field })),
      oneToManys: meta.oneToManys.map((field) => ({ ...field })),
      largeOneToManys: meta.largeOneToManys.map((field) => ({ ...field })),
      oneToOnes: meta.oneToOnes.map((field) => ({ ...field })),
      manyToManys: meta.manyToManys.map((field) => ({ ...field })),
      largeManyToManys: meta.largeManyToManys.map((field) => ({ ...field })),
      polymorphics: meta.polymorphics.map((field) => ({
        ...field,
        components: field.components.map((component) => ({ ...component })),
      })),
      nonDeferredFks: meta.nonDeferredFks,
      nonDeferredManyToManyFks: meta.nonDeferredManyToManyFks,
    };
    for (const timestamp of ["createdAt", "updatedAt", "deletedAt"] as const) {
      meta.physicalMetadata[timestamp] = meta.physicalMetadata.primitives.find(
        (field) => field.fieldName === meta[timestamp]?.fieldName,
      );
    }
  }
  setClassTableInheritance(entities, entitiesByName);
  expandSingleTableInheritance(config, entitiesByName, entities);
  rewriteSingleTableForeignKeys(config, entities);
  setupSubTypeSpecialization(config, entities);
  // Now that all relations (incl. specialized ones) exist, collapse the duplicate `otherEntity` objects
  canonicalizeOtherEntities(db);
}

/**
 * Looks for subtypes specializing a FK of their base type, and give them a specialized m2o.
 *
 * I.e. `SmallPublishers.group: SmallPublisherGroup`.
 *
 * This means the `publishers.group_id` FK will actually be in the `EntityDbMetadata` twice,
 * once for the base and once for the child, which is unusual, but gets the types generated
 * that we want, and then we fixup/dedupe them at runtime in `configure.ts` when creating
 * `meta.allFields`.
 */
function setupSubTypeSpecialization(config: Config, entities: EntityDbMetadata[]): void {
  for (const entity of entities) {
    if (entity.baseType) {
      const entityConfig = config.entities[entity.name];
      const baseConfig = config.entities[entity.baseType.name];
      // Look through the base's m2os & o2ms, looking for a config specialization
      for (const rel of [...entity.baseType.manyToOnes, ...entity.baseType.oneToManys]) {
        const { notNull } = entityConfig?.relations?.[rel.fieldName] ?? {};
        const subType =
          entityConfig?.relations?.[rel.fieldName]?.subType ??
          baseConfig?.relations?.[rel.fieldName]?.subType ??
          // Probe the otherFieldName for a `subType: "self"` on self-referential relations in STI tables
          baseConfig?.relations?.[rel.otherFieldName]?.subType ??
          // if we are only marking the relation as required and not specifying a subtype, then use the original type
          (notNull ? rel.otherEntity.name : undefined);

        if (!subType) {
          // continue...
        } else if (subType === "self" && rel.kind === "m2o") {
          // Specialize `TaskNew.copiedFrom: TaskNew` & `TaskOld.copiedFrom: TaskOld`
          entity.manyToOnes.push({ ...rel, ...(notNull ? { notNull } : {}), otherEntity: makeEntity(entity.name) });
        } else if (subType === "self" && rel.kind === "o2m") {
          // Specialize `TaskNew.copiedTo: TaskNew[]` & `TaskOld.copiedTo: TaskOld[]`
          entity.oneToManys.push({ ...rel, ...(notNull ? { notNull } : {}), otherEntity: makeEntity(entity.name) });
        } else if (rel.kind === "m2o") {
          // Specialize `SmallPublisher.group: SmallPublisherGroup`
          entity.manyToOnes.push({ ...rel, ...(notNull ? { notNull } : {}), otherEntity: makeEntity(subType) });
        } else if (rel.kind === "o2m") {
          // Specialize `SmallPublisherGroup.publishers: SmallPublisher`
          entity.oneToManys.push({ ...rel, ...(notNull ? { notNull } : {}), otherEntity: makeEntity(subType) });
        }
      }

      // Look through the base's primitives looking for a config specialization
      for (const field of entity.baseType?.primitives ?? []) {
        // the only specialization a primitive can have is nullability
        const { notNull } = entityConfig?.fields?.[field.fieldName] ?? {};
        if (notNull) {
          entity.primitives.push({ ...field, notNull });
        }
      }
    }
  }
}

/**
 * Ensure CTI base types have their inheritanceType set.
 *
 * (We automatically set `inheritanceType` for STI tables when we see their config
 * setup, see `expandSingleTableInheritance`.)
 */
function setClassTableInheritance(
  entities: EntityDbMetadata[],
  entitiesByName: Record<string, EntityDbMetadata>,
): void {
  const ctiBaseNames: string[] = [];
  for (const entity of entities) {
    if (entity.baseClassName) {
      ctiBaseNames.push(entity.baseClassName);
      const base = entitiesByName[entity.baseClassName];
      entity.baseType = base;
      base.subTypes.push(entity);
    }
  }
  for (const entity of entities) {
    if (ctiBaseNames.includes(entity.name)) entity.inheritanceType = "cti";
  }
}

/** Expands STI tables into multiple entities, so they get separate `SubTypeCodegen.ts` & `SubType.ts` files. */
function expandSingleTableInheritance(
  config: Config,
  entitiesByName: Record<string, EntityDbMetadata>,
  entities: EntityDbMetadata[],
): void {
  for (const entity of entities) {
    const [fieldName, stiField] =
      Object.entries(config.entities[entity.name]?.fields || {}).find(([, f]) => !!f.stiDiscriminator) ?? [];
    if (fieldName && stiField && stiField.stiDiscriminator) {
      entity.inheritanceType = "sti";

      // Ensure we have an enum field so that we can bake the STI discriminators into the metadata.ts file
      const enumField =
        entity.enums.find((e) => e.fieldName === fieldName) ??
        fail(`No enum column found for ${entity.name}.${fieldName}, which is required to use singleTableInheritance`);
      entity.stiDiscriminatorField = enumField.fieldName;

      // Find the available discriminators/subtypes, i.e. NEW => NewTask, OLD => OldTask, etc.
      const subTypes = Object.entries(stiField.stiDiscriminator);

      const allFields = [
        ...Object.entries(config.entities[entity.name]?.fields ?? {}),
        ...Object.entries(config.entities[entity.name]?.relations ?? {}),
      ];

      // Make sure there aren't any typos in `stiType`s
      const availableCodes = subTypes.map(([code]) => code);
      const availableNames = subTypes.map(([, name]) => name);
      const available = [...availableCodes, ...availableNames];
      for (const [name, f] of allFields) {
        for (const stiType of stiTypesOf(f)) {
          if (!available.includes(stiType)) {
            fail(`${name}.stiType '${stiType}' is invalid, expected one of ${available.join(", ")}`);
          }
        }
      }

      // A `notNull` column with no database default cannot be pushed down to a subtype: the other
      // subtypes omit it from their INSERT (see `addInserts`), and the database has nothing to fall back
      // on. A `notNull` column *with* a default is fine -- the other subtypes simply get the default.
      const requiredFieldNames = new Set(
        [...entity.primitives, ...entity.enums, ...entity.pgEnums, ...entity.manyToOnes]
          .filter((f) => f.notNull && f.columnDefault === null && !("columnGenerated" in f && f.columnGenerated))
          .map((f) => f.fieldName),
      );
      for (const [name, f] of allFields) {
        const stiTypes = stiTypesOf(f);
        // Claiming every subtype leaves no one without a value, so it's equivalent to staying on the base
        const claimsEverySubtype = subTypes.every(([code, name]) => stiTypes.some((t) => t === code || t === name));
        if (stiTypes.length > 0 && !claimsEverySubtype && requiredFieldNames.has(name)) {
          fail(
            `${entity.name}.${name} is notNull with no database default, so it cannot be pushed down to` +
              ` ${stiTypes.map((t) => `'${t}'`).join(", ")} -- the other subtypes would have no value to` +
              ` insert. Either give the column a default, make it nullable (stiType will still make it` +
              ` required on those subtypes), or leave the field on ${entity.name}.`,
          );
        }
      }

      // Names claimed by any subtype; stripped from the base after the loop, not during it, so that a
      // field claimed by two subtypes is still on the base when the second iteration looks for it.
      const claimedFieldNames = new Set(allFields.filter(([, f]) => stiTypesOf(f).length > 0).map(([name]) => name));

      // Now split each subType out into its out entity
      for (const [enumCode, subTypeName] of subTypes) {
        // Find all the base entity's fields that belong to us
        const subTypeFields = allFields.filter(([, f]) =>
          stiTypesOf(f).some((t) => t === subTypeName || t === enumCode),
        );
        const subTypeFieldNames = subTypeFields.map(([name]) => name);

        // Make fields as required
        function maybeRequired<T extends { notNull: boolean; fieldName: string }>(field: T): T {
          const config = subTypeFields.find(([name]) => name === field.fieldName)?.[1]!;
          if (config.notNull) field.notNull = true;
          return field;
        }

        // Synthesize an entity for this STI sub-entity
        const subEntity: EntityDbMetadata = {
          name: subTypeName,
          entity: makeEntity(subTypeName),
          tableName: entity.tableName,
          physicalMetadata: entity.physicalMetadata,
          ignoredColumns: entity.ignoredColumns,
          primaryKey: entity.primaryKey,
          primitives: entity.primitives.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          enums: entity.enums.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          pgEnums: entity.pgEnums.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          manyToOnes: entity.manyToOnes.filter((f) => subTypeFieldNames.includes(f.fieldName)).map(maybeRequired),
          oneToManys: entity.oneToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          largeOneToManys: entity.largeOneToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          oneToOnes: entity.oneToOnes.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          manyToManys: entity.manyToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          largeManyToManys: entity.largeManyToManys.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          manyToManyEnums: entity.manyToManyEnums.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          polymorphics: entity.polymorphics.filter((f) => subTypeFieldNames.includes(f.fieldName)),
          tagName: entity.tagName,
          createdAt: undefined,
          updatedAt: undefined,
          deletedAt: undefined,
          baseClassName: entity.name,
          baseType: entity,
          subTypes: [],
          inheritanceType: "sti",
          stiDiscriminatorValue: (
            enumField.enumRows.find((r) => r.code === enumCode) ??
            fail(`No enum row found for ${entity.name}.${fieldName}.${enumCode}`)
          ).id,
          abstract: false,
          nonDeferredFkOrder: entity.nonDeferredFkOrder,
          get nonDeferredFks(): Array<ManyToOneField | PolymorphicFieldComponent> {
            return [
              ...this.manyToOnes.filter((r) => !r.isDeferredAndDeferrable),
              ...this.polymorphics.flatMap((p) => p.components).filter((c) => !c.isDeferredAndDeferrable),
            ];
          },
          get nonDeferredManyToManyFks(): Array<ManyToManyField> {
            return this.manyToManys.filter((r) => !r.isDeferredAndDeferrable);
          },
        };

        entity.subTypes.push(subEntity);

        entities.push(subEntity);
        entitiesByName[subEntity.name] = subEntity;
      }

      // Now strip the subclass fields from the base class
      const keep = <T extends { fieldName: string }>(f: T) => !claimedFieldNames.has(f.fieldName);
      entity.primitives = entity.primitives.filter(keep);
      entity.enums = entity.enums.filter(keep);
      entity.pgEnums = entity.pgEnums.filter(keep);
      entity.manyToOnes = entity.manyToOnes.filter(keep);
      entity.oneToManys = entity.oneToManys.filter(keep);
      entity.largeOneToManys = entity.largeOneToManys.filter(keep);
      entity.oneToOnes = entity.oneToOnes.filter(keep);
      entity.manyToManys = entity.manyToManys.filter(keep);
      entity.largeManyToManys = entity.largeManyToManys.filter(keep);
      entity.manyToManyEnums = entity.manyToManyEnums.filter(keep);
      entity.polymorphics = entity.polymorphics.filter(keep);
    }
  }
}

type StiEntityMap = Map<string, { base: EntityDbMetadata; subTypes: EntityDbMetadata[] }>;
let stiEntities: StiEntityMap;

export function getStiEntities(entities: EntityDbMetadata[]): StiEntityMap {
  if (stiEntities) return stiEntities;
  stiEntities = new Map();
  for (const entity of entities) {
    if (entity.inheritanceType === "sti" && entity.stiDiscriminatorField) {
      const base = entity;
      const subTypes = entities.filter((s) => s.baseClassName === entity.name && s !== entity);
      stiEntities.set(entity.name, { base, subTypes });
      // Allow looking up by subType name
      for (const subType of subTypes) {
        stiEntities.set(subType.name, { base, subTypes: [] });
      }
    }
  }
  return stiEntities;
}

/** Finds FKs pointing to the base table and, if configured, rewrites them to point to the sub-tables. */
function rewriteSingleTableForeignKeys(config: Config, entities: EntityDbMetadata[]): void {
  // See if we even have any STI tables
  const stiEntities = getStiEntities(entities);
  if (stiEntities.size === 0) return;
  // Scan for other entities/relations that point to the STI table
  for (const entity of entities) {
    // m2os -- Look for `entity.task_id` FKs pointing at `Task` and, if configured, rewrite them to point at `TaskOld`
    for (const m2o of entity.manyToOnes) {
      const target = stiEntities.get(m2o.otherEntity.name);
      const base = target?.base.entity.name;
      // See if the user has pushed `Task.entities` down to a subtype
      // Only a lone subtype can retype the FK; naming several means the FK can point at any of them,
      // which is just the base type, so leave it alone.
      const [stiType, ...others] = stiTypesOf(
        base ? config.entities[base]?.relations?.[m2o.otherFieldName] : undefined,
      );
      if (target && stiType && others.length === 0) {
        const { subTypes } = target;
        m2o.otherEntity = (
          subTypes.find((s) => s.name === stiType) ??
          fail(`Could not find STI type '${stiType}' in ${subTypes.map((s) => s.name)}`)
        ).entity;
      }
    }
    // polys -- Look for `entity.parent_task_id` FKs pointing at `Task` and, if configured, rewrite them to point at `TaskOld`
    for (const poly of entity.polymorphics) {
      for (const comp of poly.components) {
        const target = stiEntities.get(comp.otherEntity.name);
        const base = target?.base.entity.name;
        // See if the user has pushed `Task.entities` down to a subtype
        const [stiType, ...others] = stiTypesOf(
          base ? config.entities[base]?.relations?.[comp.otherFieldName] : undefined,
        );
        if (target && stiType && others.length === 0) {
          const { subTypes } = target;
          comp.otherEntity = (
            subTypes.find((s) => s.name === stiType) ??
            fail(`Could not find STI type '${stiType}' in ${subTypes.map((s) => s.name)}`)
          ).entity;
        }
      }
    }
    // o2ms -- Look for `entity.tasks` collections loading `task.entity_id`, but entity has been pushed down to `TaskOld`
    for (const o2m of entity.oneToManys) {
      const target = stiEntities.get(o2m.otherEntity.name);
      if (target && target.base.inheritanceType === "sti") {
        // Ensure the incoming FK is not in the base type, and find the 1st subtype (eventually N subtypes?)
        const otherField = target.subTypes.find(
          (st) =>
            !target.base.manyToOnes.some((m) => m.fieldName === o2m.otherFieldName) &&
            st.manyToOnes.some((m) => m.fieldName === o2m.otherFieldName),
        );
        if (otherField) {
          o2m.otherEntity = otherField.entity;
        }
      }
    }
    // m2ms -- Look for `entity.tasks` collections loading m2m rows, but `entity` has been pushed down to `TaskOld`
    for (const m2m of entity.manyToManys) {
      const target = stiEntities.get(m2m.otherEntity.name);
      if (target && target.base.inheritanceType === "sti") {
        // Ensure the incoming FK is not in the base type, and find the 1st subtype (eventually N subtypes?)
        const otherField = target.subTypes.find(
          (st) =>
            !target.base.manyToManys.some((m) => m.fieldName === m2m.otherFieldName) &&
            st.manyToManys.some((m) => m.fieldName === m2m.otherFieldName),
        );
        if (otherField) {
          m2m.otherEntity = otherField.entity;
        }
      }
    }
  }
}

/** Normalizes a field/relation's `stiType`, which may name one subtype or several, to an array. */
function stiTypesOf(config: { stiType?: string | string[] } | undefined): string[] {
  const stiType = config?.stiType;
  return stiType === undefined ? [] : typeof stiType === "string" ? [stiType] : stiType;
}
