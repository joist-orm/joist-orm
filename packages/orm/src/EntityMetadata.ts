import { ConfigApi } from "./config";
import { Entity } from "./Entity";
import { EntityConstructor, EntityManager, TimestampFields } from "./EntityManager";
import { DeepNew } from "./loadHints";
import { FieldSerde, PolymorphicKeySerde } from "./serde";

export function getMetadata<T extends Entity>(entity: T): EntityMetadata<T>;
export function getMetadata<T extends Entity>(type: EntityConstructor<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(meta: EntityMetadata<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(param: T | EntityConstructor<T> | EntityMetadata<T>): EntityMetadata<T> {
  return (
    typeof param === "function" ? (param as any).metadata : "cstr" in param ? param : param.__orm.metadata
  ) as EntityMetadata<T>;
}

/** Runtime metadata about an entity. */
export interface EntityMetadata<T extends Entity> {
  cstr: EntityConstructor<T>;
  type: string;
  idType: "int" | "uuid";
  tableName: string;
  tagName: string;
  fields: Record<string, Field>;
  config: ConfigApi<T, any>;
  timestampFields: TimestampFields;
  factory: (em: EntityManager<any>, opts?: any) => DeepNew<T>;
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
};

export type EnumField = {
  kind: "enum";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  enumType: { getValues(): ReadonlyArray<unknown> };
  serde: FieldSerde;
  immutable: boolean;
};

export type OneToManyField = {
  kind: "o2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
};

export type LargeOneToManyField = {
  kind: "lo2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
};

export type ManyToOneField = {
  kind: "m2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: FieldSerde;
  immutable: boolean;
};

export type ManyToManyField = {
  kind: "m2m";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
  otherFieldName: string;
  serde: undefined;
  immutable: false;
};

export type OneToOneField = {
  kind: "o2o";
  fieldName: string;
  fieldIdName: string;
  required: boolean;
  otherMetadata: () => EntityMetadata<any>;
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
  otherMetadata: () => EntityMetadata<any>;
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
