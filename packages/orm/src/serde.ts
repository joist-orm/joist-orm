import { EntityMetadata } from "./EntityManager";

export interface ColumnSerde {
  setOnEntity(data: any, row: any): void;

  setOnRow(data: any, row: any): void;

  getFromEntity(data: any): any;

  mapToDb(value: any): any;
}

export class SimpleSerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName];
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
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = keyToNumber(data[this.fieldName]);
  }

  getFromEntity(data: any) {
    return keyToNumber(data[this.fieldName]);
  }

  mapToDb(value: any) {
    return value;
  }
}

export class ForeignKeySerde implements ColumnSerde {
  // TODO EntityMetadata being in here is weird.
  constructor(private fieldName: string, private columnName: string, public otherMeta: () => EntityMetadata<any>) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = keyToNumber(maybeResolveReferenceToId(data[this.fieldName]));
  }

  getFromEntity(data: any) {
    return keyToNumber(maybeResolveReferenceToId(data[this.fieldName]));
  }

  mapToDb(value: any) {
    return keyToNumber(maybeResolveReferenceToId(value));
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

// Before a referred-to object is saved, we keep its instance in our data
// map, and then assume it will be persisted before we're asked to persist
// ourselves, at which point we'll resolve it to an id.
export function maybeResolveReferenceToId(value: any): string | undefined {
  return value?.id || value;
}

/** Converts `value` to a number, i.e. for string ids, unles its undefined. */
export function keyToNumber(value: any): number | undefined {
  return value === undefined || value === null ? undefined : Number(value);
}

/** Converts `value` to a number, i.e. for string ids, unles its undefined. */
export function keyToString(value: any): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}
