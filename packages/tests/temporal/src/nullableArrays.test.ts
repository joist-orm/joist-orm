import { Temporal, ensureRectangularArraySizes, getMetadata, newPgConnectionConfig } from "joist-orm";
import { PostgreJsDriver } from "joist-orm/postgrejs";
import { Pool } from "postgrejs";
import { knex, newEntityManager } from "src/setupDbTests";

import { Author, Book } from "./entities/entities";

describe.each(["pg", "postgrejs"] as const)("nullableArrays (%s)", (driver) => {
  let nativePool: Pool | undefined;

  beforeAll(() => {
    if (driver === "postgrejs") {
      const { ssl, ...config } = newPgConnectionConfig();
      nativePool = new Pool({ ...config, ssl: ssl ? {} : undefined, requireSSL: !!ssl, timezone: "UTC" });
    }
  });

  afterAll(async () => {
    await nativePool?.close();
  });

  it("uses serialized Temporal markers before driver parameter normalization", () => {
    // Given the generated nullable Temporal columns and their serialized array elements
    const date = Temporal.PlainDate.from("2024-01-02");
    const timestamp = Temporal.PlainDateTime.from("2024-01-02T03:04:05.123456");
    const zoned = Temporal.ZonedDateTime.from("2024-01-02T03:04:05.123456-05:00[America/New_York]");
    const columns = [
      getMetadata(Author).fields.maybeBirthdays.serde!.columns[0],
      getMetadata(Author).fields.maybeTimestamps.serde!.columns[0],
      getMetadata(Book).fields.maybeTimestampTzs.serde!.columns[0],
    ];
    const values = [date, timestamp, zoned];
    const bindings = columns.map((column, i) => [null, column.mapToDbValue([]), column.mapToDbValue([values[i]])]);

    // When core pads serialized values and prefixes markers, before any driver can hide a Date/string mismatch
    ensureRectangularArraySizes(columns, bindings);

    // Then each unnest null/set marker has the same physical db type as its real elements, a string
    expect(bindings).toEqual([
      [
        [null, null],
        ["2000-01-01", null],
        ["2000-01-01", "2024-01-02"],
      ],
      [
        [null, null],
        ["2000-01-01T00:00:00", null],
        ["2000-01-01T00:00:00", "2024-01-02T03:04:05.123456"],
      ],
      [
        [null, null],
        ["2000-01-01T00:00:00+00:00", null],
        ["2000-01-01T00:00:00+00:00", "2024-01-02T03:04:05.123456-05:00"],
      ],
    ]);
  });

  it("round trips null, empty, and populated date and timestamp arrays in one bulk update", async () => {
    // Given three Authors with populated nullable date and timestamp arrays
    await knex
      .insert(
        ["a1", "a2", "a3"].map((firstName) => ({
          firstName,
          birthday: "2018-01-01",
          maybe_birthdays: ["2018-01-01"],
          maybe_timestamps: ["2018-01-01 00:00:00"],
        })),
      )
      .into("authors");
    const em = newEntityManager();
    if (nativePool) em.driver = new PostgreJsDriver(nativePool);
    const authors = await em.loadAll(Author, ["a:1", "a:2", "a:3"]);
    // When the arrays become absent, empty, and populated in the same bulk update
    authors[0].maybeBirthdays = undefined;
    authors[0].maybeTimestamps = undefined;
    authors[1].maybeBirthdays = [];
    authors[1].maybeTimestamps = [];
    authors[2].maybeBirthdays = [Temporal.PlainDate.from("2024-01-02")];
    authors[2].maybeTimestamps = [
      Temporal.PlainDateTime.from("2024-01-02T03:04:05.123456"),
      Temporal.PlainDateTime.from("2024-01-02T03:04:05.123457"),
    ];
    await em.flush();
    // Then padding and markers do not change calendar dates, microseconds, or the null-versus-empty distinction
    expect(await knex.select("maybe_birthdays", "maybe_timestamps").from("authors").orderBy("id")).toEqual([
      { maybe_birthdays: null, maybe_timestamps: null },
      { maybe_birthdays: [], maybe_timestamps: [] },
      {
        maybe_birthdays: ["2024-01-02"],
        maybe_timestamps: ["2024-01-02 03:04:05.123456", "2024-01-02 03:04:05.123457"],
      },
    ]);
  });

  it("round trips null, empty, and populated zoned timestamp arrays in one bulk update", async () => {
    // Given an Author who owns the Books
    await knex.insert({ firstName: "a1", birthday: "2018-01-01" }).into("authors");
    // And three Books with populated nullable timestamp arrays
    await knex
      .insert(
        ["b1", "b2", "b3"].map((title) => ({
          title,
          author_id: 1,
          published_at: "2018-01-01T00:00:00+00:00",
          maybe_timestamp_tzs: ["2018-01-01T00:00:00+00:00"],
        })),
      )
      .into("book");
    const em = newEntityManager();
    if (nativePool) em.driver = new PostgreJsDriver(nativePool);
    const books = await em.loadAll(Book, ["b:1", "b:2", "b:3"]);
    // When the arrays become absent, empty, and populated in the same bulk update
    books[0].maybeTimestampTzs = undefined;
    books[1].maybeTimestampTzs = [];
    books[2].maybeTimestampTzs = [
      Temporal.ZonedDateTime.from("2024-01-02T03:04:05.123456-05:00[America/New_York]"),
      Temporal.ZonedDateTime.from("2024-01-02T03:04:05.123457-05:00[America/New_York]"),
    ];
    await em.flush();
    // Then the stored instants retain microseconds and absent arrays remain different from empty arrays
    expect(await knex.select("maybe_timestamp_tzs").from("book").orderBy("id")).toEqual([
      { maybe_timestamp_tzs: null },
      { maybe_timestamp_tzs: [] },
      { maybe_timestamp_tzs: ["2024-01-02 08:04:05.123456+00", "2024-01-02 08:04:05.123457+00"] },
    ]);
  });

  it("marks empty arrays without a populated array to sample", () => {
    // Given only absent and empty arrays for Author's generated nullable date column
    const column = getMetadata(Author).fields.maybeBirthdays.serde!.columns[0];
    const bindings = [[null, column.mapToDbValue([])]];

    // When core pads the batch without any real date elements
    ensureRectangularArraySizes([column], bindings);

    // Then an empty array has an unnest null/set marker of the physical db type, distinct from an absent array
    expect(bindings).toEqual([
      [
        [null, null],
        ["2000-01-01", null],
      ],
    ]);
  });
});
