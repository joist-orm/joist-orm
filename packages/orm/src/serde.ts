import { Field, PolymorphicField, SerdeField } from "./EntityMetadata";
import {
  EntityMetadata,
  getConstructorFromTaggedId,
  keyToNumber,
  keyToString,
  maybeResolveReferenceToId,
} from "./index";

export function hasSerde(field: Field): field is SerdeField {
  return !!field.serde;
}


interface BaseFieldSerdeOpts {
  fieldName: string;
  columnName: string;
  dbType: string;
  tagName: string;
}

interface CommonFieldSerdeOpts {
  fieldName: string;
  columnName: string;
  dbType: string;
  tagName: string;
}

interface EnumFieldSerdeOpts extends BaseFieldSerdeOpts {
  enumObject: any;
}

interface SuperstructFieldSerdeOpts extends BaseFieldSerdeOpts {
  superstruct: any;
}

interface KeyFieldSerdeOpts extends BaseFieldSerdeOpts {
  dbType: 'int' | 'uuid';
  otherTagName?: string;
}

interface PolymorphicFieldSerdeOpts extends BaseFieldSerdeOpts {
  meta: () => EntityMetadata<any>;
  dbType: never;
}

/**
 * The database/column serialization / deserialization details of a given field.
 *
 * Most implementations will have just a single column in `columns`, but some logical
 * domain fields can be mapped to multiple physical database columns, i.e. polymorphic
 * references.
 */
export abstract class FieldSerde<FieldSerdeOpts extends BaseFieldSerdeOpts = BaseFieldSerdeOpts> {
  public constructor(protected opts: FieldSerdeOpts) {}

  get columnName() {
    return this.opts.columnName
  }

  get dbType() {
    return this.opts.dbType
  }

  /** A single field might persist to multiple columns, i.e. polymorphic references. */
  abstract columns: Column[];

  /**
   * Accepts a database `row` and sets the field's value(s) into the `__orm.data`.
   *
   * Used in EntityManager.hydrate to set row value on the entity
   */
  abstract setOnEntity(data: any, row: any): void;
}

/** A specific physical column of a logical field. */
export interface Column {
  columnName: string;
  dbType: string;
  dbValue(data: any): any;
  mapToDb(value: any): any;
  isArray: boolean;
}

export class PrimitiveSerde extends FieldSerde {
  isArray = false;
  columns = [this];

  // constructor(private fieldName: string, public columnName: string, public dbType: string) {}
  setOnEntity(data: any, row: any): void {
    data[this.opts.fieldName] = maybeNullToUndefined(row[this.opts.columnName]);
  }

  dbValue(data: any) {
    return data[this.opts.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}

/**
 * Maps `decimal(...)` database types to the JS `number`.
 *
 * Note that we assume the db values are within the range of the JS `number`;
 * we should eventually sanity check that.
 *
 * Also note that knex/pg accept `number`s as input, so we only need
 * to handle from-database -> to JS translation.
 */
export class DecimalToNumberSerde extends FieldSerde {
  isArray = false;
  columns = [this];

  get dbType() {
    return "decimal"
  }

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.opts.columnName]);
    data[this.opts.fieldName] = value !== undefined ? Number(value) : value;
  }

  dbValue(data: any) {
    return data[this.opts.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}

/** Maps physical integer keys to logical string IDs "because GraphQL". */
export class KeySerde extends FieldSerde<KeyFieldSerdeOpts> {
  isArray = false;
  columns = [this];
  private meta: { tagName: string; idType: "int" | "uuid" };

  constructor(protected opts: KeyFieldSerdeOpts) {
    super(opts);
    this.meta = { tagName: opts.otherTagName ?? opts.tagName, idType: opts.dbType };
  }

  setOnEntity(data: any, row: any): void {
    data[this.opts.fieldName] = keyToString(this.meta, row[this.opts.columnName]);
  }

  dbValue(data: any) {
    return keyToNumber(this.meta, maybeResolveReferenceToId(data[this.opts.fieldName]));
  }

  mapToDb(value: any) {
    return value === null ? value : keyToNumber(this.meta, maybeResolveReferenceToId(value));
  }
}

export class PolymorphicKeySerde extends FieldSerde<PolymorphicFieldSerdeOpts> {
  setOnEntity(data: any, row: any): void {
    this.columns
      .filter((column) => !!row[column.columnName])
      .forEach((column) => {
        data[this.opts.fieldName] ??= keyToString(column.otherMetadata(), row[column.columnName]);
      });
  }

  // Lazy b/c we use PolymorphicField which we can't access in our cstr
  get columns(): Array<Column & { otherMetadata: () => EntityMetadata<any> }> {
    const { fieldName } = this.opts;
    return this.field.components.map((comp) => ({
      columnName: comp.columnName,
      dbType: "int",
      isArray: false,
      otherMetadata: comp.otherMetadata,
      dbValue(data: any): any {
        const id = maybeResolveReferenceToId(data[fieldName]);
        const cstr = id ? getConstructorFromTaggedId(id) : undefined;
        return cstr === comp.otherMetadata().cstr ? keyToNumber(comp.otherMetadata(), id) : undefined;
      },
      mapToDb(value: any): any {
        return keyToNumber(comp.otherMetadata(), maybeResolveReferenceToId(value));
      },
    }));
  }

  get columnName(): string {
    throw new Error("Unsupported");
  }

  // Lazy b/c we use PolymorphicField which we can't access in our cstr
  private get field(): PolymorphicField {
    return this.opts.meta().fields[this.opts.fieldName] as PolymorphicField;
  }
}

export class EnumFieldSerde extends FieldSerde<EnumFieldSerdeOpts> {
  isArray = false;
  columns = [this];

  get dbType() {return "int" }

  setOnEntity(data: any, row: any): void {
    data[this.opts.fieldName] = this.opts.enumObject.findById(row[this.opts.columnName])?.code;
  }

  dbValue(data: any) {
    return this.opts.enumObject.findByCode(data[this.opts.fieldName])?.id;
  }

  mapToDb(value: any) {
    return this.opts.enumObject.findByCode(value)?.id;
  }
}

export class EnumArrayFieldSerde extends FieldSerde<EnumFieldSerdeOpts> {
  isArray = true;
  columns = [this];

  get dbType() {
    return "int[]";
  }

  setOnEntity(data: any, row: any): void {
    data[this.opts.fieldName] = row[this.opts.columnName]?.map((id: any) => this.opts.enumObject.findById(id).code) || [];
  }

  dbValue(data: any) {
    return data[this.opts.fieldName]?.map((code: any) => this.opts.enumObject.getByCode(code).id) || [];
  }

  mapToDb(value: any) {
    return !value ? [] : value.map((code: any) => this.opts.enumObject.getByCode(code).id);
  }
}

function maybeNullToUndefined(value: any): any {
  return value === null ? undefined : value;
}

/** Similar to SimpleSerde, but applies the superstruct `assert` function when reading values from the db. */
export class SuperstructSerde extends FieldSerde<SuperstructFieldSerdeOpts> {
  isArray = false;
  columns = [this];

  // Use a dynamic require so that downstream projects don't have to depend on superstruct
  // until they want to, i.e. we don't have superstruct in the joist-orm package.json.
  private assert = require("superstruct").assert;

  get dbType() {
    return "jsonb"
  }

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.opts.columnName]);
    if (value) {
      this.assert(value, this.opts.superstruct);
    }
    data[this.opts.fieldName] = value;
  }

  dbValue(data: any) {
    // assume the data is already valid b/c it came from the entity
    return data[this.opts.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}
