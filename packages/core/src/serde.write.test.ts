import { object, string } from "superstruct";
import { z } from "zod";

import { Color, Colors } from "../../tests/integration/src/entities/enums/Color.ts";
import { BookStatus, BookStatuses } from "../../tests/uuid-ids/src/entities/enums/BookStatus.ts";
import { setTaggedIdDelimiter } from "./keys.ts";
import {
  BigIntSerde,
  type Column,
  CustomSerdeAdapter,
  DateSerde,
  DecimalToNumberSerde,
  EnumArrayFieldSerde,
  EnumFieldSerde,
  JsonSerde,
  KeySerde,
  PlainDateSerde,
  PlainDateTimeSerde,
  PlainTimeSerde,
  PrimitiveSerde,
  SuperstructSerde,
  ZodSerde,
  ZonedDateTimeSerde,
} from "./serde.ts";
import { Temporal } from "./temporal.ts";

describe("Column.mapToDbValue", () => {
  it("encodes custom array elements once without using the filter encoder", () => {
    // Given a custom JSON-to-text mapper that would quote an already encoded value a second time
    const mapper = { toDb: jest.fn((value: unknown) => JSON.stringify(value)), fromDb: JSON.parse };
    // And a physical text array whose elements are separate domain objects
    const column = new CustomSerdeAdapter("values", "values", "text[]", mapper, true);
    // And domain values that must not be serialized as a single JSON array
    const values = Object.freeze([{ name: "first" }, { name: "second" }]);
    // And a filter encoder that must not participate in writes
    const filter = jest.spyOn(column, "mapToDb");
    // When encoding the assignment without an entity or a data hash
    const encoded = column.mapToDbValue(values);
    // Then each element reaches the custom mapper exactly once
    expect(encoded).toEqual(['{"name":"first"}', '{"name":"second"}']);
    expect(mapper.toDb.mock.calls).toEqual([[values[0]], [values[1]]]);
    expect(filter).not.toHaveBeenCalled();
    expect(values).toEqual([{ name: "first" }, { name: "second" }]);
  });

  it("encodes custom array filters elementwise and bypasses the mapper for null filters", () => {
    // Given a custom mapper that records whether it receives a whole array or its elements
    const mapper = { toDb: jest.fn((value: unknown) => JSON.stringify(value)), fromDb: JSON.parse };
    // And a physical text array whose filter must encode each element like a write
    const column = new CustomSerdeAdapter("values", "values", "text[]", mapper, true);
    // When filtering with an array and SQL NULL
    const encoded = column.mapToDb(["first", "second"]);
    const sqlNull = column.mapToDb(null);
    // Then the filter mapper receives each element once and never receives SQL NULL
    expect(encoded).toEqual(['"first"', '"second"']);
    expect(sqlNull).toBeNull();
    expect(mapper.toDb.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("keeps custom scalar writes scalar and unset arrays unmapped", () => {
    // Given a custom scalar mapper that cannot accept undefined
    const mapper = { toDb: jest.fn((value: string) => value.toUpperCase()), fromDb: (value: string) => value };
    // And scalar and array columns that share the mapper
    const scalar = new CustomSerdeAdapter("name", "name", "text", mapper);
    const array = new CustomSerdeAdapter("names", "names", "text[]", mapper, true);
    // When encoding one scalar, an unset array, and an empty array
    const encoded = scalar.mapToDbValue("first");
    const unset = array.mapToDbValue(undefined);
    const empty = array.mapToDbValue([]);
    // Then only the scalar invokes the mapper
    expect(encoded).toBe("FIRST");
    expect(unset).toBeUndefined();
    expect(empty).toEqual([]);
    expect(mapper.toDb.mock.calls).toEqual([["first"]]);
  });

  it.each([
    { name: "boolean", column: new PrimitiveSerde("value", "value", "boolean"), value: false },
    { name: "integer", column: new PrimitiveSerde("value", "value", "int"), value: 0 },
    { name: "text", column: new PrimitiveSerde("value", "value", "text"), value: "" },
    { name: "primitive array", column: new PrimitiveSerde("value", "value", "int[]", true), value: [1, 2] },
    { name: "bigint", column: new BigIntSerde("value", "value"), value: 9007199254740993n },
    { name: "decimal", column: new DecimalToNumberSerde("value", "value"), value: 12.5 },
  ])("leaves driver-native $name writes unchanged", (testCase) => {
    // Given a driver-native column exposed through the shared Column interface
    const column: Column = testCase.column;
    // When encoding its domain value
    const encoded = column.mapToDbValue!(testCase.value);
    // Then no coercion or allocation changes the binding
    expect(encoded).toBe(testCase.value);
  });

  it("encodes Date writes as ISO text without changing the filter conversion", () => {
    // Given a timestamp column using JavaScript Date values
    const column = new DateSerde("createdAt", "created_at", "timestamptz");
    // And a domain timestamp with millisecond precision
    const date = new Date("2026-09-06T12:34:56.789Z");
    // When encoding the timestamp for a write
    const encoded = column.mapToDbValue(date);
    // Then the binding matches the existing Date conversion
    expect(encoded).toBe("2026-09-06T12:34:56.789Z");
    expect(column.mapToDb(date)).toBe("2026-09-06T12:34:56.789Z");
  });

  it.each([
    { serde: PlainDateSerde, dbType: "date", value: Temporal.PlainDate.from("2026-09-06"), encoded: "2026-09-06" },
    {
      serde: PlainTimeSerde,
      dbType: "time",
      value: Temporal.PlainTime.from("12:34:56.123456"),
      encoded: "12:34:56.123456",
    },
    {
      serde: PlainDateTimeSerde,
      dbType: "timestamp",
      value: Temporal.PlainDateTime.from("2026-09-06T12:34:56.123456"),
      encoded: "2026-09-06T12:34:56.123456",
    },
    {
      serde: ZonedDateTimeSerde,
      dbType: "timestamptz",
      value: Temporal.ZonedDateTime.from("2026-09-06T12:34:56.123456-04:00[America/New_York]"),
      encoded: "2026-09-06T12:34:56.123456-04:00",
    },
  ])("encodes scalar and physical-array Temporal $dbType writes", (testCase) => {
    // Given a Temporal scalar column with its existing native mapper
    const scalar = new testCase.serde("value", "value", testCase.dbType);
    // And a physical array using the same mapper for each element
    const array = new testCase.serde("values", "values", `${testCase.dbType}[]`, true);
    // When encoding scalar and array assignments
    const encodedScalar = scalar.mapToDbValue(testCase.value);
    const encodedArray = array.mapToDbValue([testCase.value]);
    // Then temporal precision and timezone formatting match the entity write representation
    expect(encodedScalar).toBe(testCase.encoded);
    expect(encodedArray).toEqual([testCase.encoded]);
  });

  it.each([
    { dbType: "int", enums: Colors, code: Color.Red, id: 1 },
    { dbType: "uuid", enums: BookStatuses, code: BookStatus.Draft, id: "00000000-0000-0000-0000-000000000001" },
  ] as const)("encodes scalar and array enums with $dbType storage", (testCase) => {
    // Given the generated enum mapping for the physical id type
    const scalar = new EnumFieldSerde("value", "value", testCase.dbType, testCase.enums);
    // And an array column sharing that generated mapping
    const array = new EnumArrayFieldSerde("values", "values", `${testCase.dbType}[]`, true, testCase.enums);
    // When encoding scalar and array enum assignments
    const encodedScalar = scalar.mapToDbValue(testCase.code);
    const encodedArray = array.mapToDbValue([testCase.code]);
    // Then codes become physical ids, and an empty array stays distinct from omission
    expect(encodedScalar).toBe(testCase.id);
    expect(encodedArray).toEqual([testCase.id]);
    expect(array.mapToDbValue([])).toEqual([]);
  });

  it("retains enum defaults and invalid-code behavior instead of adding mutation validation", () => {
    // Given scalar and array columns using the generated Color mapping
    const scalar = new EnumFieldSerde("color", "color", "int", Colors);
    const array = new EnumArrayFieldSerde("colors", "colors", "int[]", true, Colors);
    // And an invalid color code absent from the generated enum
    const invalid = "NOT_A_COLOR";
    // When encoding unset values or that invalid code
    // Then scalar lookup remains optional, while nonempty arrays require valid codes
    expect(scalar.mapToDbValue(undefined)).toBeUndefined();
    expect(scalar.mapToDbValue(invalid)).toBeUndefined();
    expect(array.mapToDbValue(undefined)).toEqual([]);
    expect(() => array.mapToDbValue([invalid])).toThrow(TypeError);
    expect(array.mapToDb(null)).toEqual([]);
  });

  it("serializes JSON arrays as one value and invokes toJSON only once", () => {
    // Given a JSON column, not a physical SQL array
    const column = new JsonSerde("settings", "settings");
    // And a domain value with a custom JSON representation
    const toJSON = jest.fn(() => "stored");
    // When encoding a JSON array containing that value
    const encoded = column.mapToDbValue([{ toJSON }]);
    // Then the whole array is one JSON binding and the nested value is serialized once
    expect(encoded).toBe('["stored"]');
    expect(toJSON).toHaveBeenCalledTimes(1);
  });

  it("does not run Zod parsing or transforms while encoding writes", () => {
    // Given a read-time Zod schema whose transform would change a second serialization
    const schema = z.object({ name: z.string().transform((name) => `${name}!`) });
    // And a JSON column using that schema
    const column = new ZodSerde("settings", "settings", schema);
    // And a parser spy to detect accidental read-side conversion during a write
    const parse = jest.spyOn(schema, "parse");
    // When encoding a domain value that has already passed its read-time transformation
    const encoded = column.mapToDbValue({ name: "first!" });
    // Then the binding is serialized without applying that transform again
    expect(encoded).toBe('{"name":"first!"}');
    expect(parse).not.toHaveBeenCalled();
  });

  it("keeps Superstruct validation on the read path only", () => {
    // Given a JSON column with a read-time schema requiring a string name
    const column = new SuperstructSerde("settings", "settings", object({ name: string() }));
    // And deliberately invalid data whose numeric name must not introduce write-time validation
    const value = { name: 1 };
    // When encoding the value directly
    const encoded = column.mapToDbValue(value);
    // Then writes retain serialization-only behavior while reads still reject the invalid value
    expect(encoded).toBe('{"name":1}');
    expect(() => column.mapFromDb(value)).toThrow();
  });

  it.each([
    { name: "JSON", column: new JsonSerde("settings", "settings") },
    { name: "Zod", column: new ZodSerde("settings", "settings", z.unknown()) },
    { name: "Superstruct", column: new SuperstructSerde("settings", "settings", object({ name: string() })) },
  ])("retains $name null serialization, requiring callers to intercept SQL NULL", (testCase) => {
    // Given a JSON-backed column retaining the existing entity-write representation
    const column = testCase.column;
    // When raw JSON null or an unset value reaches the codec
    // Then JSON null is serialized, not silently reinterpreted as SQL NULL
    expect(column.mapToDbValue(null)).toBe("null");
    expect(column.mapToDbValue(undefined)).toBeUndefined();
    expect(column.mapToDb(null)).toBe("null");
  });

  it.each([
    { dbType: "int", tagged: "a:123", untagged: "123", encoded: 123 },
    { dbType: "bigint", tagged: "a:9007199254740993", untagged: "9007199254740993", encoded: "9007199254740993" },
    {
      dbType: "uuid",
      tagged: "a:00000000-0000-0000-0000-000000000001",
      untagged: "00000000-0000-0000-0000-000000000001",
      encoded: "00000000-0000-0000-0000-000000000001",
    },
    { dbType: "text", tagged: "a:external-key", untagged: "external-key", encoded: "external-key" },
  ] as const)("encodes tagged and untagged $dbType ids using the target metadata", (testCase) => {
    // Given an Author reference whose metadata specifies its physical key type
    const column = new KeySerde("a", "author", "author_id", testCase.dbType);
    // When encoding tagged and public untagged ids
    const tagged = column.mapToDbValue(testCase.tagged);
    const untagged = column.mapToDbValue(testCase.untagged);
    // Then the key helper retains the physical representation and rejects another entity's tag
    expect(tagged).toBe(testCase.encoded);
    expect(untagged).toBe(testCase.encoded);
    expect(() => column.mapToDbValue(`b:${testCase.untagged}`)).toThrow("Invalid tagged id, expected tag a");
  });

  it("accepts numeric public ids without requiring an entity's internal tagged id", () => {
    // Given an integer-backed Author reference in a number-id application
    const column = new KeySerde("a", "author", "author_id", "int");
    // When encoding the public numeric id
    const encoded = column.mapToDbValue(123);
    // Then the binding retains the number instead of resolving it as an entity
    expect(encoded).toBe(123);
  });

  it.each(["::", undefined])("uses the configured %s tagged-id delimiter", (delimiter) => {
    // Given an Author key whose integer storage does not depend on the tagged-id delimiter
    const column = new KeySerde("a", "author", "author_id", "int");
    // And a nondefault delimiter used by this application's metadata configuration
    setTaggedIdDelimiter(delimiter);
    try {
      // When encoding an id using that application format
      const encoded = column.mapToDbValue(`a${delimiter ?? ""}123`);
      // Then the metadata-aware key helper recognizes the tag without hard-coded string splitting
      expect(encoded).toBe(123);
    } finally {
      setTaggedIdDelimiter(":");
    }
  });
});
