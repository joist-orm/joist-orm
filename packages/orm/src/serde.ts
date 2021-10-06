import {
  EntityMetadata,
  getConstructorFromTaggedId,
  keyToNumber,
  keyToString,
  maybeResolveReferenceToId,
} from "./index";

export interface ColumnSerde {
  setOnEntity(data: any, row: any): void;

  setOnRow(data: any, row: any): void;

  getFromEntity(data: any): any;

  mapToDb(value: any): any;
}

export class SimpleSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = maybeNullToUndefined(row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = data[this.fieldName];
  }

  getFromEntity(data: any) {
    return data[this.fieldName];
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
export class DecimalToNumberSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    data[this.fieldName] = value !== undefined ? Number(value) : value;
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = data[this.fieldName];
  }

  getFromEntity(data: any) {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}

/** Maps integer primary keys ot strings "because GraphQL". */
export class PrimaryKeySerde implements ColumnSerde {
  constructor(private meta: () => EntityMetadata<any>, private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(this.meta(), row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = keyToNumber(this.meta(), data[this.fieldName]);
  }

  getFromEntity(data: any) {
    return keyToNumber(this.meta(), data[this.fieldName]);
  }

  mapToDb(value: any) {
    return keyToNumber(this.meta(), maybeResolveReferenceToId(value));
  }
}

export class ForeignKeySerde implements ColumnSerde {
  // TODO EntityMetadata being in here is weird.
  constructor(private fieldName: string, private columnName: string, public otherMeta: () => EntityMetadata<any>) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(this.otherMeta(), row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = keyToNumber(this.otherMeta(), maybeResolveReferenceToId(data[this.fieldName]));
  }

  getFromEntity(data: any) {
    return keyToNumber(this.otherMeta(), maybeResolveReferenceToId(data[this.fieldName]));
  }

  mapToDb(value: any): any {
    return keyToNumber(this.otherMeta(), maybeResolveReferenceToId(value));
  }
}

export class PolymorphicKeySerde implements ColumnSerde {
  // TODO EntityMetadata being in here is weird.  Don't think it is avoidable though.
  constructor(private fieldName: string, private columnName: string, public otherMeta: () => EntityMetadata<any>) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] ??= keyToString(this.otherMeta(), row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    const id = maybeResolveReferenceToId(data[this.fieldName]);
    const cstr = id ? getConstructorFromTaggedId(id) : undefined;
    // console.log(id, this.otherMeta().cstr, cstr, cstr === this.otherMeta().cstr);
    row[this.columnName] = cstr === this.otherMeta().cstr ? keyToNumber(this.otherMeta(), id) : undefined;

    console.log(row);
  }

  getFromEntity(data: any) {
    const id = maybeResolveReferenceToId(data[this.fieldName]);
    const cstr = id ? getConstructorFromTaggedId(id) : undefined;
    return cstr === this.otherMeta().cstr ? keyToNumber(this.otherMeta(), id) : undefined;
  }

  mapToDb(value: any): any {
    const id = maybeResolveReferenceToId(value);
    const cstr = id ? getConstructorFromTaggedId(id) : undefined;
    return cstr === this.otherMeta().cstr ? keyToNumber(this.otherMeta(), id) : undefined;
  }
}

export class EnumFieldSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string, private enumObject: any) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = this.enumObject.findById(row[this.columnName])?.code;
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = this.enumObject.findByCode(data[this.fieldName])?.id;
  }

  getFromEntity(data: any) {
    return this.enumObject.findByCode(data[this.fieldName])?.id;
  }

  mapToDb(value: any) {
    return this.enumObject.findByCode(value)?.id;
  }
}

export class EnumArrayFieldSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string, private enumObject: any) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName]?.map((id: any) => this.enumObject.findById(id).code) || [];
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = data[this.fieldName]?.map((code: any) => this.enumObject.getByCode(code).id) || [];
  }

  getFromEntity(data: any) {
    return data[this.fieldName]?.map((code: any) => this.enumObject.getByCode(code).id) || [];
  }

  mapToDb(value: any) {
    return !value ? [] : value.map((code: any) => this.enumObject.getByCode(code).id);
  }
}

function maybeNullToUndefined(value: any): any {
  return value === null ? undefined : value;
}

/** Similar to SimpleSerde, but applies the superstruct `assert` function when reading values from the db. */
export class SuperstructSerde implements ColumnSerde {
  // Use a dynamic require so that downstream projects don't have to depend on superstruct
  // until they want to, i.e. we don't have superstruct in the joist-orm package.json.
  private assert = require("superstruct").assert;

  constructor(private fieldName: string, private columnName: string, private superstruct: any) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    if (value) {
      this.assert(value, this.superstruct);
    }
    data[this.fieldName] = value;
  }

  setOnRow(data: any, row: any): void {
    // assume the data is already valid b/c it came from the eneity
    row[this.columnName] = data[this.fieldName];
  }

  getFromEntity(data: any) {
    // assume the data is already valid b/c it came from the eneity
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}
