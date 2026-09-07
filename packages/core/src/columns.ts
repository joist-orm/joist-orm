// These must be erased imports: descriptors are loaded before entity metadata and relation classes.
import type { EntityMetadata } from "./EntityMetadata.ts";
import type { ScalarCodec } from "./serde.ts";
import type { TypeInfo } from "./TypeInfo.ts";

/** A physical column owns one scalar codec, shared with every field binding for that column. */
export class Column {
  readonly insert: "required" | "optional" | "never";
  readonly update: boolean;
  /** Physical storage and SQL write policy, independent of domain field requiredness and defaults. */
  constructor(
    readonly columnName: string,
    readonly sqlNullable: boolean,
    readonly hasDefault: boolean,
    readonly isGenerated: boolean,
    /** ORM-maintained timestamps can be omitted by the SQL API as well. */
    readonly insertOptional: boolean,
    /** Polymorphic components are readable, but direct mutations remain unsupported. */
    readonly writable: boolean,
    readonly idMetadata: (() => EntityMetadata) | undefined,
    readonly codec: ScalarCodec,
  ) {
    const primaryKey = columnName === "id";
    this.insert =
      isGenerated || writable === false
        ? "never"
        : sqlNullable || hasDefault || insertOptional || (primaryKey && ["int", "bigint"].includes(codec.dbType))
          ? "optional"
          : "required";
    this.update = !primaryKey && !isGenerated && writable !== false;
  }

  get dbType(): string {
    return this.codec.dbType;
  }
  get isArray(): boolean {
    return this.codec.isArray;
  }
  get isNullableArray(): boolean {
    return this.codec.isArray && this.sqlNullable;
  }

  /** Resolve ID metadata only after all generated entity modules have initialized. */
  get outputType(): TypeInfo | undefined {
    const output = this.codec.outputType;
    if (!this.idMetadata) return output;
    // Scalar ID evidence must never be attached to an array domain or an unknown replacement codec.
    return output && !this.codec.isArray && !output.dbType.endsWith("[]")
      ? { ...output, idMeta: this.idMetadata() }
      : undefined;
  }

  mapToDb(value: any): any {
    return this.codec.mapToDb(value);
  }
  mapToDbValue(value: unknown): unknown {
    return this.codec.mapToDbValue!(value);
  }
  mapFromDb(value: unknown): unknown {
    return this.codec.mapFromDb(value);
  }
  mapFromJsonAgg(value: any): any {
    return this.codec.mapFromJsonAgg(value);
  }
}

export type ColumnDescriptors = Record<string, Column>;
