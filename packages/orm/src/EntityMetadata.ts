import { ConfigApi } from "./config";
import { Entity } from "./Entity";
import { EntityManager, MaybeAbstractEntityConstructor, TimestampFields } from "./EntityManager";
import { DeepNew } from "./loadHints";
import { FieldSerde, PolymorphicKeySerde } from "./serde";

export function getMetadata<T extends Entity>(entity: T): EntityMetadata<T>;
export function getMetadata<T extends Entity>(type: MaybeAbstractEntityConstructor<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(meta: EntityMetadata): EntityMetadata;
export function getMetadata<T extends Entity>(
  param: T | MaybeAbstractEntityConstructor<T> | EntityMetadata,
): EntityMetadata {
  return (
    typeof param === "function" ? (param as any).metadata : "cstr" in param ? param : param.__orm.metadata
  ) as EntityMetadata;
}

/**
 * Runtime metadata about an entity.
 */
export interface EntityMetadata<T extends Entity = any> {
  cstr: MaybeAbstractEntityConstructor<T>;
  type: string;
  /** Whether id field is a tagged string. */
  idType: "tagged-string" | "untagged-string" | "number";
  /** The database column type, i.e. used to do `::type` casts in Postgres. */
  idDbType: "bigint" | "int" | "uuid";
  tableName: string;
  /** If we're a subtype, our immediate base type's name, e.g. for `SmallPublisher` this would be `Publisher`. */
  baseType: string | undefined;
  tagName: string;
  fields: Record<string, Field>;
  allFields: Record<string, Field & { aliasSuffix: string }>;
  config: ConfigApi<any, any>;
  orderBy: string | undefined;
  timestampFields: TimestampFields;
  factory: (em: EntityManager<any, any>, opts?: any) => DeepNew<T>;
  /** The list of base types for this subtype, e.g. for Dog it'd be [Animal, Mammal]. */
  baseTypes: EntityMetadata[];
  /** The list of subtypes for this base type, e.g. for Animal it'd be `[Mammal, Dog]`. */
  subTypes: EntityMetadata[];
}

export type Field =
  | PrimaryKeyField
  | PrimitiveField
  | EnumField
  | OneToManyField
  | LargeOneToManyField
  | ManyToOneField
  | ManyToManyField
  | OneToOneField
  | PolymorphicField;

// Only the fields that have defined `serde` keys; should be a mapped type of Field
export type SerdeField = PrimaryKeyField | PrimitiveField | EnumField | ManyToOneField | PolymorphicField;

export type PrimaryKeyField = {
  kind: "primaryKey";
  fieldName: string;
  fieldIdName: undefined;
  required: true;
  serde: FieldSerde;
  immutable: true;
};

export type PrimitiveField = {
  kind: "primitive";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  derived: "orm" | "sync" | "async" | false;
  protected: boolean;
  type: string | Function;
  serde: FieldSerde;
  immutable: boolean;
  citext?: boolean;
};

export type EnumField = {
  kind: "enum";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  enumDetailType: { getValues(): ReadonlyArray<unknown> };
  serde: FieldSerde;
  immutable: boolean;
};

export type OneToManyField = {
  kind: "o2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
};

export type LargeOneToManyField = {
  kind: "lo2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
};

export type ManyToOneField = {
  kind: "m2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata;
  otherFieldName: string;
  serde: FieldSerde;
  immutable: boolean;
  derived: "async" | false;
};

export type ManyToManyField = {
  kind: "m2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
  joinTableName: string;
  columnNames: [string, string];
};

export type OneToOneField = {
  kind: "o2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
};

export type PolymorphicField = {
  kind: "poly";
  fieldName: string; // eg `parent`
  fieldIdName: string; // `parentId`
  required: boolean;
  components: PolymorphicFieldComponent[];
  serde: PolymorphicKeySerde;
  immutable: boolean;
};

export type PolymorphicFieldComponent = {
  otherMetadata: () => EntityMetadata;
  otherFieldName: string; // eg `comment` or `comments`
  columnName: string; // eg `parent_book_id` or `parent_book_review_id`
};

export function isOneToManyField(ormField: Field): ormField is OneToManyField {
  return ormField.kind === "o2m";
}

export function isManyToOneField(ormField: Field): ormField is ManyToOneField {
  return ormField.kind === "m2o";
}

export function isManyToManyField(ormField: Field): ormField is ManyToManyField {
  return ormField.kind === "m2m";
}

export function isOneToOneField(ormField: Field): ormField is OneToOneField {
  return ormField.kind === "o2o";
}

export function isPolymorphicField(ormField: Field): ormField is PolymorphicField {
  return ormField.kind === "poly";
}

export function isReferenceField(ormField: Field): ormField is ManyToOneField | OneToOneField | PolymorphicField {
  return ormField.kind === "m2o" || ormField.kind === "o2o" || ormField.kind === "poly";
}

export function isCollectionField(ormField: Field): ormField is OneToManyField | ManyToManyField {
  return ormField.kind === "o2m" || ormField.kind === "m2m";
}

export function getBaseAndSelfMetas(meta: EntityMetadata): EntityMetadata[] {
  return [...meta.baseTypes, meta];
}

export function getBaseSelfAndSubMetas(meta: EntityMetadata): EntityMetadata[] {
  return [...meta.baseTypes, meta, ...meta.subTypes];
}

export function getBaseMeta(meta: EntityMetadata): EntityMetadata {
  if (!meta.baseType) {
    return meta;
  } else {
    return meta.baseTypes[0];
  }
}
