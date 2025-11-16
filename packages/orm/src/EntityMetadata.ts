import { getInstanceData } from "./BaseEntity";
import { Entity, isEntity } from "./Entity";
import { EntityManager, MaybeAbstractEntityConstructor, TimestampFields } from "./EntityManager";
import { ConfigApi } from "./config";
import { DeepNew } from "./loadHints";
import { FieldSerde, PolymorphicKeySerde } from "./serde";

export function getMetadata<T extends Entity>(entity: T): EntityMetadata<T>;
export function getMetadata<T extends Entity>(type: MaybeAbstractEntityConstructor<T>): EntityMetadata<T>;
export function getMetadata<T extends Entity>(meta: EntityMetadata): EntityMetadata;
export function getMetadata<T extends Entity>(
  param: T | MaybeAbstractEntityConstructor<T> | EntityMetadata,
): EntityMetadata {
  if (!param) throw new Error(`Cannot getMetadata of ${param}`);
  return (
    typeof param === "function" ? (param as any).metadata : "cstr" in param ? param : getInstanceData(param).metadata
  ) as EntityMetadata;
}

/**
 * Runtime metadata about an entity.
 *
 * The `joist-codegen` step will generate this by reading the database schema at build/codegen
 * time, along with any customizations in `joist-config.json`.
 *
 * Note: This has no generic, like `T extends Entity`, because `Entity<IdType>` i.e. with
 * an unknown string/id type, causes issues when we want to generically mix `EntityMetadata`
 * of different types, that even liberally using `EntityMetadata<any>` did not avoid.
 */
export interface EntityMetadata<T extends Entity = any> {
  cstr: MaybeAbstractEntityConstructor<T>;
  type: string;
  /** Whether id field is a tagged string. */
  idType: "tagged-string" | "untagged-string" | "number";
  /** The database column type, i.e. used to do `::type` casts in Postgres. */
  idDbType: "bigint" | "int" | "uuid" | "text";
  tableName: string;
  /** If we're a subtype, our immediate base type's name, e.g. for `SmallPublisher` this would be `Publisher`. */
  baseType: string | undefined;
  inheritanceType?: "sti" | "cti" | undefined;
  /** Indicates the field to use to derive which subtype to instantiate; only set on the base meta. */
  stiDiscriminatorField?: string;
  /** The discriminator enum value for this subtype; only set on sub metas. */
  stiDiscriminatorValue?: number;
  /** Whether this type is abstract (cannot be instantiated directly). */
  ctiAbstract?: boolean;
  tagName: string;
  fields: Record<string, Field>;
  allFields: Record<string, Field & { aliasSuffix: string }>;
  /** Usually polys are in `allFields`, but we pull the components out for comp-specific finds, like `parentBook`. */
  polyComponentFields?: Record<string, Field & { aliasSuffix: string }>;
  // Using `any` to avoid type errors between BaseType.metadata & SubType.metadata static fields
  config: ConfigApi<any, any>;
  orderBy: string | undefined;
  timestampFields: TimestampFields | undefined;
  // Ideally this would be the application-specific EntityManager (to avoid anys), but it doesn't really matter
  factory: (em: EntityManager<any, any, any>, opts?: any) => DeepNew<T>;
  /** The list of base types for this subtype, e.g. for Dog it'd be [Animal, Mammal]. */
  baseTypes: EntityMetadata[];
  /** The list of subtypes for this base type, e.g. for Animal it'd be `[Mammal, Dog]`. */
  subTypes: EntityMetadata[];
  /** If the schema is lacking deferred FKs, this is our insertion order. */
  nonDeferredFkOrder?: number;
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
  default?: "schema" | "config";
  sanitize?: boolean;
};

export type EnumField = {
  kind: "enum";
  fieldName: string;
  fieldIdName: undefined;
  required: boolean;
  derived: "sync" | "async" | false;
  enumDetailType: { getValues(): ReadonlyArray<unknown>; findById(id: any): unknown };
  serde: FieldSerde;
  immutable: boolean;
  default?: "schema" | "config";
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
  default?: "schema" | "config";
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

export function getBaseAndSelfMetas(meta: EntityMetadata): EntityMetadata[];
export function getBaseAndSelfMetas(entity: Entity): EntityMetadata[];
export function getBaseAndSelfMetas(param: Entity | EntityMetadata): EntityMetadata[] {
  return isEntity(param) ? getBaseSelfAndSubMetas(getMetadata(param)) : [...param.baseTypes, param];
}

export function getBaseSelfAndSubMetas(meta: EntityMetadata): EntityMetadata[] {
  return [...meta.baseTypes, meta, ...meta.subTypes];
}

export function getSubMetas(meta: EntityMetadata): EntityMetadata[] {
  // We should do recursion at some point
  return meta.subTypes;
}

export function getBaseMeta(meta: EntityMetadata): EntityMetadata {
  if (!meta.baseType) {
    return meta;
  } else {
    return meta.baseTypes[0];
  }
}
