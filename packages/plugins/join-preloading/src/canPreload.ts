import { EntityMetadata, Field, ManyToManyField, ManyToOneField, OneToManyField, OneToOneField } from "joist-orm";

export function canPreload(
  meta: EntityMetadata<any>,
  field: Field,
): field is OneToManyField | ManyToOneField | ManyToManyField | OneToOneField {
  if (field.kind === "o2m" || field.kind === "o2o" || field.kind === "m2o" || field.kind === "m2m") {
    const otherMeta = field.otherMetadata();
    // We don't support preloading tables with inheritance yet
    if (!!otherMeta.baseType || otherMeta.subTypes.length > 0) return false;
    // If `otherField` is missing, this could be a large collection which currently can't be loaded...
    const otherField = otherMeta.allFields[field.otherFieldName];
    if (!otherField) return false;
    // If otherField is a poly that points to a sub/base component, we don't support that yet
    if (otherField.kind === "poly" && !otherField.components.some((c) => c.otherMetadata() === meta)) return false;
    return true;
  }
  return false;
}
