import { BaseExpr, type ExprOutputType, type SqlFragment, arrayOutputType, asNode } from "./Expr.ts";
import {
  type Column,
  type CustomSerde,
  CustomSerdeAdapter,
  DateSerde,
  DecimalToNumberSerde,
  KeySerde,
  PlainDateSerde,
  PlainDateTimeSerde,
  PlainTimeSerde,
  PrimitiveSerde,
  ZonedDateTimeSerde,
} from "./serde.ts";

describe("expression output types", () => {
  it.each(["min", "max"] as const)("describes PostgreSQL's text overload for %s(name)", (operation) => {
    // Given a PostgreSQL name column whose scalar values are limited to identifier length
    const column = new ColumnExpr(new PrimitiveSerde("name", "name", "name"));
    // When an aggregate and fallback resolve through PostgreSQL's text overload
    const aggregate = asNode(column[operation]().coalesce("x".repeat(70)));
    // Then the aggregate cannot falsely agree with the original name representation
    expect(column.outputType?.dbType).toBe("name");
    expect(aggregate.outputType?.dbType).toBe("text");
  });

  it.each(["favorite_shape", "citext"])("rejects %s arrays without a common physical array parser", (dbType) => {
    // Given a scalar native enum or citext column that the text driver returns as a string
    const scalar = new PrimitiveSerde("value", "value", dbType);
    // And a physical array whose text-driver result is an unparsed PostgreSQL array string
    const array = new PrimitiveSerde("values", "values", `${dbType}[]`, true);
    // When deriving array output metadata from the known scalar codec
    const aggregate = asNode(new ColumnExpr(scalar).arrayAgg());
    // Then scalar compatibility does not promise a usable physical array representation
    expect(scalar.outputType).toBeDefined();
    expect(array.outputType).toBeUndefined();
    expect(aggregate.outputType).toBeUndefined();
  });

  it.each(["int4", "varchar"])("keeps matching physical and aggregated %s arrays compatible", (dbType) => {
    // Given a scalar column with the same driver value type inside and outside an array
    const scalar = new PrimitiveSerde("value", "value", dbType);
    // And a physical array with an elementwise identity encoder and decoder
    const array = new PrimitiveSerde("values", "values", `${dbType}[]`, true);
    // When describing the scalar aggregate
    const aggregate = asNode(new ColumnExpr(scalar).arrayAgg());
    // Then both outputs share the array domain without confusing it with the scalar domain
    expect(array.outputType).toBeDefined();
    expect(aggregate.outputType).toEqual(array.outputType);
    expect(aggregate.outputType?.domain).not.toBe(scalar.outputType?.domain);
  });

  it("keeps Author-id aggregate decoding and binding elementwise", () => {
    // Given an Author-id column whose integer storage differs from its tagged domain values
    const id = new ColumnExpr(new KeySerde("a", "id", "id", "int"));
    // When aggregating Author ids, including a SQL NULL element
    const aggregate = asNode(id.arrayAgg());
    // Then the known int4 array parser works with the existing key conversions
    expect(aggregate.outputType?.dbType).toBe("int4[]");
    expect(aggregate.outputType?.idMeta).toBeUndefined();
    expect(aggregate.decode([1, null])).toEqual(["a:1", null]);
    expect(aggregate.encode(["a:1", null])).toEqual([1, null]);
  });

  it.each(["numeric", "decimal"])("rejects a string-only custom %s mapper for arrayAgg", (dbType) => {
    // Given a numeric mapper that needs string methods, not numeric[]'s classic-pg number elements
    const mapper: CustomSerde<string, string> = { fromDb: (value) => value.trim(), toDb: (value) => value };
    // And an adapter whose scalar SQL representation is known despite the array conversion mismatch
    const column = new CustomSerdeAdapter("amount", "amount", dbType, mapper);
    // When deriving metadata for an aggregate over that scalar column
    const aggregate = asNode(new ColumnExpr(column).arrayAgg());
    // Then the scalar mapper remains supported but cannot declare a safe array conversion
    expect(column.outputType?.domain).toBe(mapper);
    expect(column.mapFromDb("12.5")).toBe("12.5");
    expect(aggregate.outputType).toBeUndefined();
  });

  it("accepts a custom text mapper when scalar and array elements are both strings", () => {
    // Given a custom text mapper that trims the driver's strings
    const mapper: CustomSerde<string, string> = { fromDb: (value) => value.trim(), toDb: (value) => value };
    // And a scalar text column using that mapper
    const column = new CustomSerdeAdapter("name", "name", "text", mapper);
    // When deriving an aggregate with a known text[] parser
    const aggregate = asNode(new ColumnExpr(column).arrayAgg());
    // Then the same mapper can decode each non-null array element
    expect(aggregate.outputType?.dbType).toBe("text[]");
    expect(aggregate.decode([" Alice ", null])).toEqual(["Alice", null]);
  });

  it.each([
    { dbType: "numeric", operation: "avg" },
    { dbType: "bigint", operation: "sum" },
  ] as const)("distinguishes primitive $dbType strings from $operation numbers with the same SQL type", (testCase) => {
    // Given a primitive numeric column that leaves its driver's scalar strings unchanged
    const primitive = new PrimitiveSerde("amount", "amount", testCase.dbType);
    // And an integer age column whose aggregate uses Number conversion
    const age = new ColumnExpr(new PrimitiveSerde("age", "age", "int"));
    // When comparing the scalar and aggregate descriptors
    const aggregate = asNode(age[testCase.operation]());
    // Then equal SQL types cannot conceal the decoder mismatch in either operand order
    expect(primitive.outputType?.dbType).toBe(aggregate.outputType?.dbType);
    expect(primitive.outputType?.domain).not.toBe(aggregate.outputType?.domain);
    expect(primitive.mapFromDb("12")).toBe("12");
    expect(aggregate.decode("12")).toBe(12);
  });

  it("keeps DecimalToNumberSerde compatible with numeric aggregates and their array elements", () => {
    // Given a decimal column that explicitly converts either numbers or strings to Number
    const decimal = new DecimalToNumberSerde("amount", "amount");
    // And an integer age column whose AVG returns numeric with Number conversion
    const age = new ColumnExpr(new PrimitiveSerde("age", "age", "int"));
    // When comparing the numeric scalar and array descriptors
    const average = asNode(age.avg());
    // Then the known conversions agree across classic numeric[] numbers and lazy binary strings
    expect(decimal.outputType).toBeDefined();
    expect(decimal.outputType).toEqual(average.outputType);
    expect(decimal.mapFromDb("12.5")).toBe(12.5);
    expect(decimal.mapFromDb(12.5)).toBe(12.5);
    expect(arrayOutputType(decimal.outputType)).toBeDefined();
    expect(arrayOutputType(decimal.outputType)).toEqual(asNode(average.arrayAgg()).outputType);
    expect(asNode(average.arrayAgg()).decode([12.5, null])).toEqual([12.5, null]);
    expect(asNode(average.arrayAgg()).decode(["12.5", null])).toEqual([12.5, null]);
  });

  it("rejects primitive numeric arrays whose identity conversion differs between drivers", () => {
    // Given a primitive numeric column without DecimalToNumberSerde's explicit conversion
    const scalar = new PrimitiveSerde("amount", "amount", "numeric");
    // And a physical numeric[] column that preserves either classic numbers or lazy binary strings
    const array = new PrimitiveSerde("amounts", "amounts", "numeric[]", true);
    // When describing the physical array or scalar aggregate
    // Then neither path promises a stable number or string array domain
    expect(array.outputType).toBeUndefined();
    expect(asNode(new ColumnExpr(scalar).arrayAgg()).outputType).toBeUndefined();
  });

  it.each([
    { name: "Date", serde: DateSerde, dbType: "date" },
    { name: "PlainDate", serde: PlainDateSerde, dbType: "date" },
    { name: "PlainTime", serde: PlainTimeSerde, dbType: "time" },
    { name: "PlainDateTime", serde: PlainDateTimeSerde, dbType: "timestamp" },
    { name: "ZonedDateTime", serde: ZonedDateTimeSerde, dbType: "timestamptz" },
  ])("keeps ambiguous $name array aggregates unknown", (testCase) => {
    // Given a Date or Temporal scalar codec without assuming a matching driver array configuration
    const column = new testCase.serde("value", "value", testCase.dbType);
    // When deriving an array aggregate from that supported scalar
    const aggregate = asNode(new ColumnExpr(column).arrayAgg());
    // Then the scalar stays known without promising a safe physical array element type
    expect(column.outputType).toBeDefined();
    expect(aggregate.outputType).toBeUndefined();
  });

  it("requires an explicit conversion proof and rejects nested SQL arrays", () => {
    // Given an integer descriptor with no declaration about array element conversion
    const undeclared = { dbType: "int4", domain: Number };
    // And a proven integer array whose aggregate would add another SQL array dimension
    const nested = { dbType: "int4[]", domain: Number, arrayElementSafe: true };
    // When deriving array descriptors without a supported scalar conversion and representation
    // Then neither descriptor becomes a known array codec
    expect(arrayOutputType(undeclared)).toBeUndefined();
    expect(arrayOutputType(nested)).toBeUndefined();
  });
});

/** Exercises expression propagation with the same column converters as an alias, without entity fixtures. */
class ColumnExpr extends BaseExpr {
  constructor(private column: Column) {
    super();
  }

  get outputType(): ExprOutputType | undefined {
    return this.column.outputType;
  }

  toSql(): SqlFragment {
    return { sql: this.column.columnName, bindings: [], refs: [] };
  }

  decode(value: unknown): unknown {
    return value === null || value === undefined ? value : this.column.mapFromDb(value);
  }

  encode(value: unknown): unknown {
    return this.column.mapToDb(value);
  }
}
