import pluralize from "pluralize";

import type { Config } from "./config.ts";
import type { Entity, EntityDbMetadata } from "./EntityDbMetadata.ts";

/** A generated recursive collection and the immediate relation it traverses. */
export interface RecursiveRelation {
  fieldName: string;
  kind: "parents" | "children" | "m2m";
  relationName: string;
  otherFieldName: string;
  otherEntity: Entity;
}

/**
 * Discovers recursive properties once for entity declarations, filters, and runtime metadata.
 * Uses the same names and opt-outs for FK-backed and self-referential m2m collections.
 */
export function recursiveRelations(config: Config, meta: EntityDbMetadata): RecursiveRelation[] {
  // STI subtypes don't have their own key in config.entities (stripped by stripStiPlaceholders),
  // so look up the base class name to find skipRecursiveRelations config.
  const entityConfig =
    config.entities[meta.inheritanceType === "sti" && meta.baseClassName ? meta.baseClassName : meta.name];
  const result: RecursiveRelation[] = [];
  // Add any recursive ManyToOne entities.
  for (const m2o of meta.manyToOnes) {
    if (m2o.otherEntity.name !== meta.name) continue;
    // Allow disabling recursive relations.
    if (entityConfig?.relations?.[m2o.fieldName]?.skipRecursiveRelations === true) continue;
    // Skip ReactiveReferences because they don't have an `other` side for us to use.
    if (m2o.derived) continue;
    const { fieldName, otherFieldName, otherEntity } = m2o;
    const parentsField = `${pluralize.plural(fieldName)}Recursive`;
    const maybeOneToOne = meta.oneToOnes.some((o2o) => o2o.fieldName === otherFieldName);
    const childrenField = `${maybeOneToOne ? pluralize.plural(otherFieldName) : otherFieldName}Recursive`;
    result.push(
      { fieldName: parentsField, kind: "parents", relationName: fieldName, otherFieldName: childrenField, otherEntity },
      {
        fieldName: childrenField,
        kind: "children",
        relationName: otherFieldName,
        otherFieldName: parentsField,
        otherEntity,
      },
    );
  }
  // Add any recursive ManyToMany entities (self-referential m2m).
  for (const m2m of meta.manyToManys) {
    if (m2m.otherEntity.name !== meta.name || m2m.derived) continue;
    if (entityConfig?.relations?.[m2m.fieldName]?.skipRecursiveRelations === true) continue;
    result.push({
      fieldName: `${m2m.fieldName}Recursive`,
      kind: "m2m",
      relationName: m2m.fieldName,
      otherFieldName: `${m2m.otherFieldName}Recursive`,
      otherEntity: m2m.otherEntity,
    });
  }
  return result;
}
