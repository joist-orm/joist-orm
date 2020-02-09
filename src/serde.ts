export interface ColumnSerde {
  setOnEntity(data: any, row: any): void;

  setOnRow(data: any, row: any): void;

  getFromEntity(data: any): any;
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
}

export class ForeignKeySerde implements ColumnSerde {
  constructor(private fieldName: string, private columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(row[this.columnName]);
  }

  setOnRow(data: any, row: any): void {
    row[this.columnName] = keyToNumber(maybeResolveReferenceToId(data[this.fieldName]));
  }

  getFromEntity(data: any) {
    return keyToNumber(maybeResolveReferenceToId(data[this.fieldName]));
  }
}

// Before a referred-to object is saved, we keep its instance in our data
// map, and then assume it will be persisted before we're asked to persist
// ourselves, at which point we'll resolve it to an id.
export function maybeResolveReferenceToId(value: any) {
  return value.id || value;
}

/** Converts `value` to a number, i.e. for string ids, unles its undefined. */
export function keyToNumber(value: any): number | undefined {
  return value === undefined ? undefined : Number(value);
}

/** Converts `value` to a number, i.e. for string ids, unles its undefined. */
export function keyToString(key: any): string | undefined {
  return key === undefined ? undefined : String(key);
}
