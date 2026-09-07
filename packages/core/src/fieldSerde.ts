import type { Column } from "./columns.ts";
import { getConstructorFromTaggedId } from "./configure.ts";
import type { InsertFixup } from "./drivers/EntityWriter.ts";
import { type Entity, isEntity } from "./Entity.ts";
import {
  type EntityMetadata,
  type Field,
  type PolymorphicField,
  type PolymorphicFieldComponent,
  type SerdeField,
  getBaseMeta,
  getMetadata,
} from "./EntityMetadata.ts";
import { maybeResolveReferenceToId } from "./keys.ts";
import type { RowData } from "./RowData.ts";
import type { TimestampCodec } from "./serde.ts";
import { groupBy } from "./utils.ts";

export function hasSerde(field: Field): field is SerdeField {
  return !!field.serde;
}

/** Entity hydration and flush bindings; a polymorphic relationship spans several physical columns. */
export interface FieldSerde {
  columns: FieldColumn[];
  /** Decode one domain value from accessed cells; callers own entity assignment and caching. */
  fromRow(rowData: RowData, rowIndex: number): unknown;
}

export interface TimestampSerde<T> extends FieldSerde {
  mapFromNow(now: Date): T;
  dbValue(data: any): any;
}

/** Binds a physical column to entity data without adding a second codec or storage declaration. */
export class FieldColumn {
  constructor(
    readonly fieldName: string,
    readonly column: Column,
  ) {}
  get codec() {
    return this.column.codec;
  }
  get insertOptional() {
    return this.column.insertOptional;
  }
  get writable() {
    return this.column.writable;
  }
  get insert() {
    return this.column.insert;
  }
  get update() {
    return this.column.update;
  }
  get idMetadata() {
    return this.column.idMetadata;
  }
  get columnName(): string {
    return this.column.columnName;
  }
  get dbType(): string {
    return this.column.dbType;
  }
  get isArray(): boolean {
    return this.column.isArray;
  }
  get isNullableArray(): boolean {
    return this.column.isNullableArray;
  }
  get sqlNullable(): boolean {
    return this.column.sqlNullable;
  }
  get hasDefault(): boolean {
    return this.column.hasDefault;
  }
  get isGenerated(): boolean {
    return this.column.isGenerated;
  }
  get outputType() {
    return this.column.outputType;
  }
  mapToDb(value: any): any {
    return this.column.mapToDb(value);
  }
  mapToDbValue(value: unknown): unknown {
    return this.column.mapToDbValue(value);
  }
  mapFromDb(value: unknown): unknown {
    return this.column.mapFromDb(value);
  }
  mapFromJsonAgg(value: any): any {
    return this.column.mapFromJsonAgg(value);
  }

  /** Defers FK writes whose new target must be inserted after this entity. */
  dbValue(data: any, entity: Entity, tableName: string, fixups: InsertFixup[] | undefined): any {
    const value = data[this.fieldName];
    if (
      this.column.idMetadata &&
      fixups &&
      isEntity(value) &&
      value.isNewEntity &&
      getMetadata(value).nonDeferredFkOrder &&
      getMetadata(entity).nonDeferredFkOrder &&
      getMetadata(value).nonDeferredFkOrder! >= getMetadata(entity).nonDeferredFkOrder!
    ) {
      fixups.push({ entity, tableName, column: this, value: this.mapToDbValue(maybeResolveReferenceToId(value)) });
      return null;
    }
    return this.mapToDbValue(value);
  }

  /** Reconstruct the driver's row representation, which can differ from write bindings for Date and JSON. */
  rowValue(data: any): any {
    return this.column.codec.mapToRow(data[this.fieldName]);
  }
}

/** Binds one entity field to its physical column. */
export class SimpleFieldSerde extends FieldColumn implements FieldSerde {
  readonly columns: FieldColumn[] = [this];
  /** Decode this field's physical column without changing entity data. */
  fromRow(rowData: RowData, rowIndex: number): unknown {
    return this.column.mapFromDb(rowData.get(rowIndex, this.column.columnName));
  }
  mapFromNow(now: Date): unknown {
    return (this.column.codec as TimestampCodec<unknown>).mapFromNow(now);
  }
}

/** A polymorphic field selects exactly one component while each physical column retains a scalar ID codec. */
export class PolymorphicKeySerde implements FieldSerde {
  readonly columns: PolymorphicFieldColumn[];
  constructor(
    readonly fieldName: string,
    components: PolymorphicFieldComponent[],
  ) {
    this.columns = components.map((component) => new PolymorphicFieldColumn(fieldName, component, components));
  }
  /** Select the first truthy component whose decoded ID is not nullish. */
  fromRow(rowData: RowData, rowIndex: number): unknown {
    let decoded: unknown;
    for (const column of this.columns) {
      const value = rowData.get(rowIndex, column.columnName);
      if (value) {
        decoded = column.mapFromDb(value);
        if (decoded != null) return decoded;
      }
    }
    return decoded;
  }
}

/** Shares domain components between relationship traversal and entity write selection. */
export function polymorphicField(
  fieldName: string,
  required: boolean,
  components: PolymorphicFieldComponent[],
): PolymorphicField {
  return {
    kind: "poly",
    fieldName,
    fieldIdName: `${fieldName}Id`,
    required,
    components,
    serde: new PolymorphicKeySerde(fieldName, components),
    immutable: false,
  };
}

/** A domain relationship component references storage and only overrides a specialized domain target. */
export class PolyComponent implements PolymorphicFieldComponent {
  constructor(
    readonly column: Column,
    readonly otherFieldName: string,
    private readonly target?: () => EntityMetadata,
  ) {}
  get columnName(): string {
    return this.column.columnName;
  }
  get otherMetadata(): () => EntityMetadata {
    return this.target ?? this.column.idMetadata!;
  }
}

/** Selects a relationship component for entity writes only; direct SQL writes use its scalar column codec. */
class PolymorphicFieldColumn extends FieldColumn {
  constructor(
    fieldName: string,
    private readonly component: PolymorphicFieldComponent,
    private readonly components: PolymorphicFieldComponent[],
  ) {
    super(fieldName, component.column);
  }
  get otherMetadata() {
    return this.component.otherMetadata;
  }

  /** Preserve exact subtype selection when multiple components share a base type. */
  mapToDbValue(value: unknown): unknown {
    const id = maybeResolveReferenceToId(value as Parameters<typeof maybeResolveReferenceToId>[0]);
    const cstr = isEntity(value) ? getMetadata(value).cstr : id ? getConstructorFromTaggedId(id) : undefined;
    // If our poly has multiple components from the same base type, i.e.
    // `parent_small_publisher_id` and `parent_large_publisher_id`, then we
    // need slightly different logic...
    const hasMultipleComponentsWithSameBaseType = [
      ...groupBy(this.components, (component) => getBaseMeta(component.otherMetadata()).type).values(),
    ].some((group) => group.length > 1);
    const otherMeta = this.otherMetadata();
    // We'll have multiple columns, i.e. [parent_author_id, parent_book_id], and each column
    // will only return a value if the `id` matches its type, i.e. `parent_author_id=a:1` will
    // return 1, but `parent_book_id` will return null.
    const applies = hasMultipleComponentsWithSameBaseType
      ? cstr === otherMeta.cstr
      : cstr === otherMeta.cstr ||
        cstr === getBaseMeta(otherMeta).cstr ||
        otherMeta.subTypes.some((subTypeMeta) => cstr === subTypeMeta.cstr);
    return applies ? this.column.mapToDbValue(id) : undefined;
  }
  // Polymorphic writes historically do not schedule non-deferred FK fixups.
  dbValue(data: any): any {
    return this.mapToDbValue(data[this.fieldName]);
  }
  rowValue(data: any): any {
    return this.dbValue(data);
  }
}
