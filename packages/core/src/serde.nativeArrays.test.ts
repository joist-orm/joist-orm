import { array, string } from "superstruct";
import { z } from "zod";

import { arrayOutputType } from "./Expr.ts";
import { BigIntSerde, DecimalToNumberSerde, JsonSerde, SuperstructSerde, ZodSerde } from "./serde.ts";

describe("native numeric array serdes", () => {
  it.each([
    { serde: DecimalToNumberSerde, dbType: "numeric[]", strings: ["0", "1.25", "2.5"], values: [0, 1.25, 2.5] },
    {
      serde: BigIntSerde,
      dbType: "bigint[]",
      strings: ["0", "9007199254740993", "-5"],
      values: [0n, 9007199254740993n, -5n],
    },
  ])("decodes each $dbType element instead of coercing the entire array", (testCase) => {
    // Given a nullable native numeric array column with complete physical storage flags
    const column = new testCase.serde("values", "values", true, true);
    // And the equivalent scalar codec used by SQL aggregate output descriptions
    const scalar = new testCase.serde("value", "value");
    // When decoding either text-backed or already parsed driver elements
    const fromStrings = column.mapFromDb(testCase.strings);
    const fromValues = column.mapFromDb(testCase.values);
    // Then decoding is elementwise, including zero and bigint values beyond Number's exact range
    expect(fromStrings).toEqual(testCase.values);
    expect(fromValues).toEqual(testCase.values);
    expect(column.dbType).toEqual(testCase.dbType);
    expect(column.isArray).toEqual(true);
    expect(column.isNullableArray).toEqual(true);
    expect(column.outputType).toBeDefined();
    expect(column.outputType).toEqual(arrayOutputType(scalar.outputType));
    expect(column.mapFromDb([])).toEqual([]);
    expect(column.mapFromDb(null)).toEqual(undefined);
    expect(column.mapFromDb(undefined)).toEqual(undefined);
    expect(column.mapFromDb([null, testCase.strings[0]])).toEqual([null, testCase.values[0]]);
  });

  it.each([
    { serde: DecimalToNumberSerde, values: Object.freeze([1.25, 2.5]), jsonValues: [1.25, 2.5] },
    { serde: BigIntSerde, values: Object.freeze([1n, 2n]), jsonValues: [1, 2] },
  ])("retains driver-native writes and elementwise JSON aggregate reads for $serde.name", (testCase) => {
    // Given a numeric array column whose driver accepts its domain elements directly
    const column = new testCase.serde("values", "values", true);
    // When encoding direct writes, entity writes, filters, and mirrored rows
    // Then none of those paths convert the entire array into a scalar or change the binding
    expect(column.mapToDbValue(testCase.values)).toBe(testCase.values);
    expect(column.dbValue({ values: testCase.values })).toBe(testCase.values);
    expect(column.mapToDb(testCase.values)).toBe(testCase.values);
    expect(column.rowValue({ values: testCase.values })).toBe(testCase.values);
    expect(column.mapFromJsonAgg(testCase.jsonValues)).toEqual(testCase.values);
    expect(column.mapFromJsonAgg(null)).toEqual(null);
  });

  it("preserves scalar decimal and bigint construction and conversion", () => {
    // Given the existing two-argument scalar constructors
    const decimal = new DecimalToNumberSerde("amount", "amount");
    // And a scalar bigint column with the same existing constructor contract
    const bigint = new BigIntSerde("count", "count");
    // When decoding scalar driver values
    // Then scalar storage, flags, and converters remain unchanged
    expect(decimal.dbType).toEqual("decimal");
    expect(decimal.isArray).toEqual(false);
    expect(decimal.isNullableArray).toEqual(false);
    expect(decimal.mapFromDb("1.25")).toEqual(1.25);
    expect(bigint.dbType).toEqual("bigint");
    expect(bigint.isArray).toEqual(false);
    expect(bigint.isNullableArray).toEqual(false);
    expect(bigint.mapFromDb("9007199254740993")).toEqual(9007199254740993n);
  });

  it.each([DecimalToNumberSerde, BigIntSerde])("rejects nested numeric values with $name", (Serde) => {
    // Given a declared one-dimensional array, which PostgreSQL can still populate with nested values
    const column = new Serde("values", "values", true);
    // And a multidimensional value that must not be coerced as one numeric element
    const nested = [[1, 2]];
    // When those values reach the write or read codec
    // Then they fail explicitly rather than becoming NaN or an incorrectly coerced bigint
    expect(() => column.mapToDbValue(nested)).toThrow("Native numeric arrays must be one-dimensional");
    expect(() => column.mapFromDb(nested)).toThrow("Native numeric arrays must be one-dimensional");
  });

  it.each([
    new JsonSerde("values", "values"),
    new SuperstructSerde("values", "values", array(string())),
    new ZodSerde("values", "values", z.array(z.string())),
  ])("keeps JSON-stored arrays distinct from physical SQL arrays with $constructor.name", (column) => {
    // Given a scalar jsonb column whose domain value happens to be a JavaScript array
    const value = ["first", "second"];
    // When the JSON or schema codec encodes that domain value
    const encoded = column.mapToDbValue(value);
    // Then one JSON value is serialized; codegen must not use these codecs for native jsonb[] mutations
    expect(encoded).toEqual('["first","second"]');
    expect(column.dbType).toEqual("jsonb");
    expect(column.isArray).toEqual(false);
    expect(column.mapFromDb(value)).toEqual(value);
  });
});
