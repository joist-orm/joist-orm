import { camelCase, pascalCase, snakeCase } from "change-case";
import { Column, EnumType, M2MRelation, M2ORelation, O2MRelation, Table } from "pg-structure";
import { plural, singular } from "pluralize";
import { imp, Import } from "ts-poet";
import {
  Config,
  getTimestampConfig,
  isAsyncDerived,
  isDerived,
  isFieldIgnored,
  isLargeCollection,
  isProtected,
  ormMaintainedFields,
  RelationConfig,
  relationName,
  superstructConfig,
} from "./config";
import { EnumMetadata, EnumRow } from "./index";
import { fail, isEnumTable, isJoinTable, mapSimpleDbTypeToTypescriptType, tableToEntityName } from "./utils";

/** Codegen-time metadata about a given domain entity. */
export type Entity = {
  name: string;
  /** The symbol pointing to the entity itself. */
  type: Import;
  /** The name of the entity's runtime metadata const. */
  metaName: string;
  /** The symbol pointing to the entity's runtime metadata const. */
  metaType: Import;
  /** The symbol pointing to the entity's EntityId type. */
  idType: Import;
  /** The symbol pointing to the entity's Order type. */
  orderType: Import;
  /** The symbol pointing to the entity's config const. */
  configConst: Import;
  optsType: Import;
};

export type DatabaseColumnType =
  | "boolean"
  | "int"
  | "uuid"
  | "numeric"
  | "smallint"
  | "integer"
  | "bigint"
  | "decimal"
  | "real"
  | "smallserial"
  | "serial"
  | "bigserial"
  | "double precision"
  | "text"
  | "citext"
  | "character varying"
  | "varchar"
  | "timestamp with time zone"
  | "timestamp without time zone"
  | "date"
  | "jsonb";

/**
 * A logical entity field.
 *
 * I.e. it may be a physical db column, or multiple physical db columns, or a "virtual" field like
 * the one-to-many collection side of a many-to-one foreign key. */
interface Field {
  fieldName: string;
  ignore?: boolean;
}

export type PrimitiveTypescriptType = "boolean" | "string" | "number" | "Date" | "Object";

export type PrimitiveField = Field & {
  kind: "primitive";
  columnName: string;
  columnType: DatabaseColumnType;
  columnDefault: number | boolean | string | null;
  // The fieldType might be code for jsonb columns
  fieldType: PrimitiveTypescriptType | Import;
  rawFieldType: PrimitiveTypescriptType;
  notNull: boolean;
  derived: "orm" | "sync" | "async" | false;
  protected: boolean;
  superstruct: Import | undefined;
};

export type EnumField = Field & {
  kind: "enum";
  columnName: string;
  columnDefault: number | boolean | string | null;
  enumName: string;
  enumType: Import;
  enumRows: EnumRow[];
  notNull: boolean;
  isArray: boolean;
};

export type PgEnumField = Field & {
  kind: "pg-enum";
  columnName: string;
  columnDefault: number | boolean | string | null;
  enumName: string;
  enumType: Import;
  enumValues: string[];
  notNull: boolean;
};

/** I.e. a `Book.author` reference pointing to an `Author`. */
export type ManyToOneField = Field & {
  kind: "m2o";
  columnName: string;
  dbType: string;
  otherFieldName: string;
  otherEntity: Entity;
  notNull: boolean;
};

/** I.e. a `Author.books` collection. */
export type OneToManyField = Field & {
  kind: "o2m";
  singularName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  otherColumnNotNull: boolean;
  isLargeCollection: boolean;
};

/** I.e. a `Author.image` reference when `image.author_id` is unique. */
export type OneToOneField = Field & {
  kind: "o2o";
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  otherColumnNotNull: boolean;
};

export type ManyToManyField = Field & {
  kind: "m2m";
  joinTableName: string;
  singularName: string;
  columnName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  isLargeCollection: boolean;
};

/** I.e. a `Comment.parent` reference that groups `comments.parent_book_id` and `comments.parent_book_review_id`. */
export type PolymorphicField = Field & {
  fieldType: string; // The name of the type union, eg `CommentParent`
  notNull: boolean;
  components: PolymorphicFieldComponent[];
};

export type PolymorphicFieldComponent = {
  columnName: string; // eg `parent_book_id` or `parent_book_review_id`
  otherFieldName: string; // eg `comment` or `comments`
  otherEntity: Entity;
};

/** Adapts the generally-great pg-structure metadata into our specific ORM types. */
export class EntityDbMetadata {
  entity: Entity;
  // I.e. id for sequences or uuid
  idDbType: string;
  primitives: PrimitiveField[];
  enums: EnumField[];
  pgEnums: PgEnumField[];
  manyToOnes: ManyToOneField[];
  oneToManys: OneToManyField[];
  largeOneToManys: OneToManyField[];
  oneToOnes: OneToOneField[];
  manyToManys: ManyToManyField[];
  largeManyToManys: ManyToManyField[];
  polymorphics: PolymorphicField[];
  tableName: string;
  tagName: string;
  createdAt: PrimitiveField | undefined;
  updatedAt: PrimitiveField | undefined;

  constructor(config: Config, table: Table, enums: EnumMetadata = {}) {
    this.entity = makeEntity(tableToEntityName(config, table));
    this.idDbType = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.type.shortName)[0] ?? fail();

    this.primitives = table.columns
      .filter((c) => !c.isPrimaryKey && !c.isForeignKey)
      .filter((c) => !isEnumArray(c) && !isPgEnum(c))
      .map((column) => newPrimitive(config, this.entity, column, table))
      .filter((f) => !f.ignore);

    this.enums = [
      ...table.m2oRelations
        .filter((r) => isEnumTable(config, r.targetTable))
        .map((r) => newEnumField(config, this.entity, r, enums))
        .filter((f) => !f.ignore),
      ...table.columns
        .filter((c) => isEnumArray(c))
        .map((column) => newEnumArrayField(config, this.entity, column, enums))
        .filter((f) => !f.ignore),
    ];
    this.pgEnums = [
      ...table.columns
        .filter((c) => isPgEnum(c))
        .map((column) => newPgEnumField(config, this.entity, column))
        .filter((f) => !f.ignore),
    ];

    this.manyToOnes = table.m2oRelations
      .filter((r) => !isEnumTable(config, r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isComponentOfPolymorphicRelation(config, r))
      .map((r) => newManyToOneField(config, this.entity, r))
      .filter((f) => !f.ignore);

    // We split these into regular/large...
    const allOneToManys = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(config, r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isOneToOneRelation(r))
      .map((r) => newOneToMany(config, this.entity, r))
      .filter((f) => !f.ignore);
    this.oneToManys = allOneToManys.filter((f) => !f.isLargeCollection);
    this.largeOneToManys = allOneToManys.filter((f) => f.isLargeCollection);

    this.oneToOnes = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(config, r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => isOneToOneRelation(r))
      .map((r) => newOneToOne(config, this.entity, r))
      .filter((f) => !f.ignore);

    // We split these into regular/large
    const allManyToManys = table.m2mRelations
      // pg-structure is really loose on what it considers a m2m relationship, i.e. any entity
      // that has a foreign key to us, and a foreign key to something else, is automatically
      // considered as a join table/m2m between "us" and "something else". Filter these out
      // by looking for only true join tables, i.e. tables with only id, fk1, and fk2.
      .filter((r) => isJoinTable(config, r.joinTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .map((r) => newManyToManyField(config, this.entity, r))
      .filter((f) => !f.ignore);
    this.manyToManys = allManyToManys.filter((f) => !f.isLargeCollection);
    this.largeManyToManys = allManyToManys.filter((f) => f.isLargeCollection);

    this.polymorphics = polymorphicRelations(config, table).map((rc) =>
      newPolymorphicField(config, table, this.entity, rc),
    );

    this.tableName = table.name;
    this.tagName = config.entities[this.entity.name]?.tag;

    const { createdAtConf, updatedAtConf } = getTimestampConfig(config);
    this.createdAt = this.primitives.find((f) => createdAtConf.names.includes(f.columnName));
    this.updatedAt = this.primitives.find((f) => updatedAtConf.names.includes(f.columnName));
  }

  get name(): string {
    return this.entity.name;
  }
}

function isMultiColumnForeignKey(r: M2ORelation | O2MRelation | M2MRelation) {
  return r.foreignKey.columns.length > 1;
}

function isOneToOneRelation(r: O2MRelation) {
  // otherColumn will be the images.book_id in the other table
  const otherColumn = r.foreignKey.columns[0];
  // r.foreignKey.index is the index on _us_ (i.e. our Book primary key), so look up indexes in the target table
  const indexes = r.targetTable.columns.find((c) => c.name == otherColumn.name)?.uniqueIndexes || [];
  // If the column is the only column in an unique index, it's a one-to-one
  return indexes.find((i) => i.columns.length === 1) !== undefined;
}

function polymorphicRelations(config: Config, table: Table) {
  const entity = config.entities[tableToEntityName(config, table)];
  return Object.entries(entity?.relations ?? {})
    .filter(([, r]) => r.polymorphic)
    .map(([name, relation]) => ({ name, ...relation }));
}

function polymorphicFieldName(config: Config, r: M2ORelation | O2MRelation) {
  const { name } = r.foreignKey.columns[0];
  const table = r instanceof M2ORelation ? r.sourceTable : r.targetTable;
  return polymorphicRelations(config, table).find((pr) => name.startsWith(`${snakeCase(pr.name)}_`))?.name;
}

function isComponentOfPolymorphicRelation(config: Config, r: M2ORelation) {
  return polymorphicFieldName(config, r) !== undefined;
}

function newPrimitive(config: Config, entity: Entity, column: Column, table: Table): PrimitiveField {
  const fieldName = primitiveFieldName(column.name);
  const columnName = column.name;
  const columnType = (column.type.shortName || column.type.name) as DatabaseColumnType;
  const fieldType = mapType(table.name, columnName, columnType);
  const superstruct = superstructConfig(config, entity, fieldName);
  const maybeUserType = fieldType === "Object" && superstruct ? superstructType(superstruct) : fieldType;
  return {
    kind: "primitive",
    fieldName,
    columnName,
    columnType,
    fieldType: maybeUserType,
    rawFieldType: fieldType,
    notNull: column.notNull,
    columnDefault: column.default,
    derived: fieldDerived(config, entity, fieldName),
    protected: isProtected(config, entity, fieldName),
    ignore: isFieldIgnored(config, entity, fieldName, column.notNull, column.default !== null),
    superstruct: fieldType === "Object" && superstruct ? Import.from(superstruct) : undefined,
  };
}

function fieldDerived(config: Config, entity: Entity, fieldName: string): PrimitiveField["derived"] {
  if (ormMaintainedFields.includes(fieldName)) {
    return "orm";
  } else if (isDerived(config, entity, fieldName)) {
    return "sync";
  } else if (isAsyncDerived(config, entity, fieldName)) {
    return "async";
  } else {
    return false;
  }
}

function newEnumField(config: Config, entity: Entity, r: M2ORelation, enums: EnumMetadata): EnumField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const fieldName = enumFieldName(column.name);
  const enumName = tableToEntityName(config, r.targetTable);
  const enumType = imp(`${enumName}@./entities`);
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return {
    kind: "enum",
    fieldName,
    columnName,
    columnDefault: column.default,
    enumName,
    enumType,
    notNull,
    ignore,
    enumRows: enums[r.targetTable.name].rows,
    isArray: false,
  };
}

function newEnumArrayField(config: Config, entity: Entity, column: Column, enums: EnumMetadata): EnumField {
  const columnName = column.name;
  const fieldName = enumFieldName(column.name);
  // Find the enum table name via the comment hint (instead of a FK constraint), and strip the enum= prefix
  const enumTable = column.comment!.replace("enum=", "");
  const enumName = (enums[enumTable] || fail(`Could not find enum ${enumTable}`)).name;
  const enumType = imp(`${enumName}@./entities`);
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return {
    kind: "enum",
    fieldName,
    columnName,
    columnDefault: column.default,
    enumName,
    enumType,
    notNull,
    ignore,
    enumRows: enums[enumTable].rows,
    isArray: true,
  };
}

function newPgEnumField(config: Config, entity: Entity, column: Column): PgEnumField {
  const fieldName = primitiveFieldName(column.name);
  const columnName = column.name;
  const enumName = pascalCase(column.type.name);
  const enumType = imp(`${enumName}@./entities`);
  return {
    kind: "pg-enum",
    fieldName,
    columnName,
    enumType,
    enumName,
    enumValues: (column.type as EnumType).values,
    notNull: column.notNull,
    columnDefault: column.default,
    ignore: isFieldIgnored(config, entity, fieldName, column.notNull, column.default !== null),
  };
}

function newManyToOneField(config: Config, entity: Entity, r: M2ORelation): ManyToOneField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const dbType = r.foreignKey.columns[0].type.shortName!;
  const fieldName = referenceName(config, entity, r);
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const isOneToOne = column.uniqueIndexes.find((i) => i.columns.length === 1) !== undefined;
  const otherFieldName = isOneToOne
    ? oneToOneName(config, otherEntity, entity, r)
    : collectionName(config, otherEntity, entity, r).fieldName;
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return { kind: "m2o", fieldName, columnName, otherEntity, otherFieldName, notNull, ignore, dbType };
}

function newOneToMany(config: Config, entity: Entity, r: O2MRelation): OneToManyField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const { singularName, fieldName } = collectionName(config, entity, otherEntity, r);
  const otherFieldName = referenceName(config, otherEntity, r);
  return {
    kind: "o2m",
    fieldName,
    singularName,
    otherEntity,
    otherFieldName,
    otherColumnName: column.name,
    otherColumnNotNull: column.notNull,
    ignore: isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName),
    isLargeCollection: isLargeCollection(config, entity, fieldName),
  };
}

function newOneToOne(config: Config, entity: Entity, r: O2MRelation): OneToOneField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const fieldName = oneToOneName(config, entity, otherEntity, r);
  const otherFieldName = referenceName(config, otherEntity, r);
  const otherColumnName = column.name;
  const otherColumnNotNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName);
  return { kind: "o2o", fieldName, otherEntity, otherFieldName, otherColumnName, otherColumnNotNull, ignore };
}

function newManyToManyField(config: Config, entity: Entity, r: M2MRelation): ManyToManyField {
  const { foreignKey, targetForeignKey, targetTable } = r;
  const otherEntity = makeEntity(tableToEntityName(config, targetTable));
  const fieldName = relationName(
    config,
    entity,
    camelCase(plural(targetForeignKey.columns[0].name.replace(/_id|Id$/, ""))),
  );
  const otherFieldName = relationName(
    config,
    otherEntity,
    camelCase(plural(foreignKey.columns[0].name.replace(/_id|Id$/, ""))),
  );
  return {
    kind: "m2m",
    joinTableName: r.joinTable.name,
    fieldName,
    singularName: singular(fieldName),
    columnName: foreignKey.columns[0].name,
    otherEntity,
    otherFieldName,
    otherColumnName: targetForeignKey.columns[0].name,
    ignore: isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName),
    isLargeCollection: isLargeCollection(config, entity, fieldName),
  };
}

function newPolymorphicField(config: Config, table: Table, entity: Entity, rc: RelationConfig) {
  const { polymorphic, name } = rc;
  const fieldName = name!;
  const components = table.m2oRelations
    .filter((r) => !isEnumTable(config, r.targetTable))
    .filter((r) => !isMultiColumnForeignKey(r))
    .filter((r) => polymorphicFieldName(config, r) === fieldName)
    .map((r) => newPolymorphicFieldComponent(config, entity, r));

  return {
    fieldName,
    fieldType: `${entity.name}${pascalCase(fieldName)}`,
    notNull: polymorphic === "notNull",
    components,
  };
}

function newPolymorphicFieldComponent(config: Config, entity: Entity, r: M2ORelation): PolymorphicFieldComponent {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const isOneToOne = column.uniqueIndexes.find((i) => i.columns.length === 1) !== undefined;
  const otherFieldName = isOneToOne
    ? oneToOneName(config, otherEntity, entity, r)
    : collectionName(config, otherEntity, entity, r).fieldName;
  return { columnName, otherEntity, otherFieldName };
}

/** Finds the field name for o2o side of a o2o/m2o. */
export function oneToOneName(
  config: Config,
  //  I.e. the Book for o2o Book.image <-- `images.book_id`
  refEntity: Entity,
  // I.e. the Image for o2o Book.image <-- `images.book_id`
  keyEntity: Entity,
  r: M2ORelation | O2MRelation,
): string {
  // For `comments.parent_book_review_id`, we would just use `BookReview.comment` as the name
  // For `authors.draft_current_book_id`, we would just use `Book.author` as the name
  // For `project_items.current_selection_id`, we would use `HomeownerSelection.currentProjectItem`
  const keyTable = r instanceof M2ORelation ? r.sourceTable : r.targetTable;
  const refTable = r instanceof M2ORelation ? r.targetTable : r.sourceTable;
  // Does the ref table have any m2o pointing table at the key table?
  const found = refTable.m2oRelations.find((s) => tableToEntityName(config, s.targetTable) === keyEntity.name);
  // console.log({refTable: refTable.name, keyTable: keyTable.name, found: found?.name, fieldName});
  if (!found) {
    // If there aren't any m2os, just use the raw type name like `.image` or `.comment`
    const fieldName = camelCase(keyEntity.name);
    return relationName(config, refEntity, fieldName);
  } else {
    // If there is a m2o, assume we might conflict, and use the column name to at least be unique
    // Start with `book` from `images.book_id` or `current_draft_book` from `authors.current_draft_book_id`
    let fieldName = r.foreignKey.columns[0].name.replace(/_id|Id$/, "");
    // Suffix the new type that we're pointing to, to `current_draft_book_author`
    fieldName = `${fieldName}_${keyEntity.name}`;
    // And drop the `book`, to `current_draft__author`
    fieldName = fieldName.replace(refEntity.name.toLowerCase(), "");
    // Then camel case, to `currentDraftAuthor`
    fieldName = camelCase(fieldName);
    return relationName(config, refEntity, fieldName);
  }
}

export function referenceName(config: Config, entity: Entity, r: M2ORelation | O2MRelation): string {
  const column = r.foreignKey.columns[0];
  const fieldName = polymorphicFieldName(config, r) ?? camelCase(column.name.replace(/_id|Id$/, ""));
  return relationName(config, entity, fieldName);
}

function enumFieldName(columnName: string) {
  return camelCase(columnName.replace(/_id|Id$/, ""));
}

function primitiveFieldName(columnName: string) {
  return camelCase(columnName);
}

/** Returns the collection name to use on `entity` when referring to `otherEntity`s. */
export function collectionName(
  config: Config,
  // I.e. the Author for o2m Author.books --> books.author_id
  singleEntity: Entity,
  // I.e. the Book for o2m Author.books --> books.author_id
  collectionEntity: Entity,
  r: M2ORelation | O2MRelation,
): { fieldName: string; singularName: string } {
  // I.e. if the m2o is `books.author_id`, use `Author.books` as the collection name (we pluralize a few lines down).
  let fieldName = collectionEntity.name;
  // Check if we have multiple FKs from collectionEntity --> singleEntity and prefix with FK name if so
  const sourceTable = r instanceof M2ORelation ? r.sourceTable : r.targetTable;
  const targetTable = r instanceof M2ORelation ? r.targetTable : r.sourceTable;
  // If `books.foo_author_id` and `books.bar_author_id` both exist
  if (sourceTable.m2oRelations.filter((r) => r.targetTable === targetTable).length > 1) {
    // Use `fooAuthorBooks`, `barAuthorBooks`
    fieldName = `${r.foreignKey.columns[0].name.replace(/_id|Id$/, "")}_${fieldName}`;
  }
  // If we've guessed `Book.bookReviews` based on `book_reviews.book_id` --> `bookReviews`, strip the `Book` prefix
  if (fieldName.length > singleEntity.name.length) {
    fieldName = fieldName.replace(singleEntity.name, "");
  }

  // camelize the name
  let singularName = camelCase(fieldName);
  fieldName = camelCase(plural(fieldName));

  // If the name is overridden, use that, but also singularize it
  const maybeOverriddenName = relationName(config, singleEntity, fieldName);
  if (maybeOverriddenName !== fieldName) {
    singularName = singular(maybeOverriddenName);
    fieldName = maybeOverriddenName;
  }

  return { singularName, fieldName };
}

export function makeEntity(entityName: string): Entity {
  return {
    name: entityName,
    type: entityType(entityName),
    metaName: metaName(entityName),
    metaType: metaType(entityName),
    idType: imp(`${entityName}Id@./entities`, { definedIn: `./${entityName}Codegen` }),
    orderType: imp(`${entityName}Order@./entities`, { definedIn: `./${entityName}Codegen` }),
    optsType: imp(`${entityName}Opts@./entities`, { definedIn: `./${entityName}Codegen` }),
    configConst: imp(`${camelCase(entityName)}Config@./entities`, { definedIn: `./${entityName}Codegen` }),
  };
}

function metaName(entityName: string): string {
  return `${camelCase(entityName)}Meta`;
}

function metaType(entityName: string): Import {
  return imp(`${metaName(entityName)}@./entities`);
}

function entityType(entityName: string): Import {
  return imp(`${entityName}@./entities`);
}

function mapType(tableName: string, columnName: string, dbColumnType: DatabaseColumnType): PrimitiveTypescriptType {
  return mapSimpleDbTypeToTypescriptType(dbColumnType);
}

function isEnumArray(c: Column): boolean {
  return c.arrayDimension === 1 && !!c.comment && c.comment.startsWith("enum=");
}

function isPgEnum(c: Column): boolean {
  return c.type instanceof EnumType;
}

function superstructType(s: string): Import {
  // Assume it's `foo@...`, turn it into `Foo@...`
  const [symbol, path] = s.split("@");
  return Import.from(`${pascalCase(symbol)}@${path}`);
}
