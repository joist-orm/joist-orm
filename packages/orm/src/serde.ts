import { EntityMetadata, keyToNumber, keyToString, maybeResolveReferenceToId } from "./index";

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
    return value;
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

function maybeNullToUndefined(value: any): any {
  return value === null ? undefined : value;
}
