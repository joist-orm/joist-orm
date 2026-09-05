import { expectTypeOf } from "expect-type";
import {
  CustomSerdeAdapter,
  type ExecuteResult,
  PlainTimeSerde,
  Temporal,
  alias,
  getMetadata,
  query,
  sql,
} from "joist-orm";
import { Author, Book } from "src/entities";
import { knex, newEntityManager, queries, resetQueryCount } from "src/setupDbTests";
import { jan1, jan1at10am, jan1at11am, jan2, jan2DateTime, jan3, ten01AndMicros, ten02 } from "src/utils";

describe("EntityManager.execute", () => {
  it.each([
    {
      field: "birthday" as const,
      values: { birthday: jan2 },
      set: { birthday: jan3 },
      type: Temporal.PlainDate,
      inserted: "2018-01-02",
      updated: "2018-01-03",
    },
    {
      field: "timestamp" as const,
      values: { timestamp: Temporal.PlainDateTime.from("2018-01-01T10:00:00.123456") },
      set: { timestamp: Temporal.PlainDateTime.from("2018-01-02T11:00:00.654321") },
      type: Temporal.PlainDateTime,
      inserted: "2018-01-01T10:00:00.123456",
      updated: "2018-01-02T11:00:00.654321",
    },
    {
      field: "timeToMicros" as const,
      values: { timeToMicros: Temporal.PlainTime.from("10:01:00.12345678") },
      set: { timeToMicros: Temporal.PlainTime.from("11:02:00.65432149") },
      type: Temporal.PlainTime,
      inserted: "10:01:00.123457",
      updated: "11:02:00.654321",
    },
    {
      field: "createdAt" as const,
      values: { createdAt: Temporal.ZonedDateTime.from("2018-01-01T10:00:00.123456-08:00[America/Los_Angeles]") },
      set: { createdAt: Temporal.ZonedDateTime.from("2018-07-01T10:00:00.654321-07:00[America/Los_Angeles]") },
      type: Temporal.ZonedDateTime,
      inserted: "2018-01-01T18:00:00.123456+00:00[UTC]",
      updated: "2018-07-01T17:00:00.654321+00:00[UTC]",
    },
  ])("round-trips Author.$field through VALUES, UPDATE, and scalar RETURNING", async (testCase) => {
    // Given a fresh Author import with the physical firstName and birthday requirements
    const em = newEntityManager();
    const a = alias(Author);
    // And the selected Temporal field has distinct insert and update values
    const returning = a[testCase.field];

    // When inserting the domain value without creating a managed Author
    const inserted = await em.execute({
      insert: a,
      values: { firstName: "Temporal", birthday: jan1, ...testCase.values },
      returning,
    });

    // Then scalar RETURNING decodes the stored precision and PostgreSQL session timezone
    expect(inserted.rowCount).toBe(1);
    expect(inserted.rows).toHaveLength(1);
    expect(inserted.rows[0]).toBeInstanceOf(testCase.type);
    expect(inserted.rows[0]!.toString()).toBe(testCase.inserted);

    // When replacing the same physical field with a different Temporal value
    const updated = await em.execute({ update: a, set: testCase.set, where: a.id.eq("a:1"), returning });

    // Then UPDATE uses the write codec and returns the replacement rather than the original value
    expect(updated.rowCount).toBe(1);
    expect(updated.rows).toHaveLength(1);
    expect(updated.rows[0]).toBeInstanceOf(testCase.type);
    expect(updated.rows[0]!.toString()).toBe(testCase.updated);
    expect(em.entities).toEqual([]);
    expect((await newEntityManager().query({ from: a, select: returning }))[0]!.toString()).toBe(testCase.updated);
  });

  it("writes and returns Author's physical date, time, and local timestamp arrays", async () => {
    // Given a fresh Author import with two distinct elements in each Temporal array
    const em = newEntityManager();
    const a = alias(Author);
    const returning = {
      birthdays: a.childrenBirthdays,
      maybeBirthdays: a.maybeBirthdays,
      times: a.times,
      maybeTimes: a.maybeTimes,
      timestamps: a.timestamps,
      maybeTimestamps: a.maybeTimestamps,
    };

    // When VALUES receives physical arrays rather than scalar filter parameters
    const inserted = await em.execute({
      insert: a,
      values: {
        firstName: "Arrays",
        birthday: jan1,
        childrenBirthdays: [jan1, jan2],
        maybeBirthdays: [jan2, jan3],
        times: [ten01AndMicros, ten02],
        maybeTimes: [ten02, ten01AndMicros],
        timestamps: [jan1at10am, jan1at11am],
        maybeTimestamps: [jan1at11am, jan1at10am],
      },
      returning,
    });

    // Then each array retains its element order and Temporal decoder in the named result
    expectTypeOf(inserted).toEqualTypeOf<
      ExecuteResult<{
        birthdays: Temporal.PlainDate[];
        maybeBirthdays: Temporal.PlainDate[] | null;
        times: Temporal.PlainTime[];
        maybeTimes: Temporal.PlainTime[] | null;
        timestamps: Temporal.PlainDateTime[];
        maybeTimestamps: Temporal.PlainDateTime[] | null;
      }>
    >();
    expect(inserted.rowCount).toBe(1);
    expect(inserted.rows).toEqual([
      {
        birthdays: [jan1, jan2],
        maybeBirthdays: [jan2, jan3],
        times: [ten01AndMicros, ten02],
        maybeTimes: [ten02, ten01AndMicros],
        timestamps: [jan1at10am, jan1at11am],
        maybeTimestamps: [jan1at11am, jan1at10am],
      },
    ]);
    expect(inserted.rows[0].times.map((time) => time.toString())).toEqual(["10:01:00.123456", "10:02:00"]);
    expect(inserted.rows[0].maybeTimes!.map((time) => time.toString())).toEqual(["10:02:00", "10:01:00.123456"]);
    expect(inserted.rows[0].times[0]).toBeInstanceOf(Temporal.PlainTime);
    expect(inserted.rows[0].birthdays[0]).toBeInstanceOf(Temporal.PlainDate);
    expect(inserted.rows[0].timestamps[0]).toBeInstanceOf(Temporal.PlainDateTime);

    // When filtering physical Temporal arrays and the same arrays in a compound's derived output
    const branch = { from: a, select: returning };
    const arrays = query({ union: [branch, branch], as: "arrays" });
    const direct = await em.query({
      from: a,
      where: {
        and: [
          a.childrenBirthdays.eq([jan1, jan2]),
          a.times.eq([ten01AndMicros, ten02]),
          a.timestamps.eq([jan1at10am, jan1at11am]),
        ],
      },
      select: returning,
    });
    const combined = await em.query({
      from: arrays,
      where: {
        and: [
          arrays.birthdays.eq([jan1, jan2]),
          arrays.times.eq([ten01AndMicros, ten02]),
          arrays.timestamps.eq([jan1at10am, jan1at11am]),
        ],
      },
      select: arrays,
    });
    // Then both encoders accept domain elements and both decoders retain Temporal values
    expect(direct).toEqual(inserted.rows);
    expect(combined).toEqual(inserted.rows);
    expectTypeOf(combined[0].birthdays).toEqualTypeOf<Temporal.PlainDate[]>();
    expectTypeOf(combined[0].times).toEqualTypeOf<Temporal.PlainTime[]>();
    expectTypeOf(combined[0].timestamps).toEqualTypeOf<Temporal.PlainDateTime[]>();

    // When replacing each array with a different length and element order
    const updated = await em.execute({
      update: a,
      set: {
        childrenBirthdays: [jan3],
        maybeBirthdays: [jan1],
        times: [ten02],
        maybeTimes: [ten01AndMicros],
        timestamps: [jan1at11am],
        maybeTimestamps: [jan1at10am],
      },
      where: a.id.eq("a:1"),
      returning,
    });

    // Then UPDATE replaces rather than appends the arrays and persists their physical representations
    expect(updated.rowCount).toBe(1);
    expect(updated.rows).toEqual([
      {
        birthdays: [jan3],
        maybeBirthdays: [jan1],
        times: [ten02],
        maybeTimes: [ten01AndMicros],
        timestamps: [jan1at11am],
        maybeTimestamps: [jan1at10am],
      },
    ]);
    expect(updated.rows[0].times.map((time) => time.toString())).toEqual(["10:02:00"]);
    expect(updated.rows[0].maybeTimes!.map((time) => time.toString())).toEqual(["10:01:00.123456"]);
    expect(
      await knex("authors").select(
        "children_birthdays",
        "maybe_birthdays",
        "times",
        "maybe_times",
        "timestamps",
        "maybe_timestamps",
      ),
    ).toEqual([
      {
        children_birthdays: ["2018-01-03"],
        maybe_birthdays: ["2018-01-01"],
        times: ["10:02:00"],
        maybe_times: ["10:01:00.123456"],
        timestamps: ["2018-01-01 11:00:00"],
        maybe_timestamps: ["2018-01-01 10:00:00"],
      },
    ]);
    expect(em.entities).toEqual([]);
  });

  it("writes Book's zoned scalar and physical arrays across timezone offsets with microseconds", async () => {
    // Given a persisted Author for the Book's required physical foreign key
    await knex("authors").insert({ firstName: "Owner", birthday: "2018-01-01" });
    // And publication instants on both sides of Los Angeles daylight saving time
    const winter = Temporal.ZonedDateTime.from("2018-01-01T10:00:00.123456-08:00[America/Los_Angeles]");
    const summer = Temporal.ZonedDateTime.from("2018-07-01T10:00:00.654321-07:00[America/Los_Angeles]");
    const em = newEntityManager();
    const b = alias(Book);

    // When inserting the ZonedDateTime scalar and both physical array fields
    const inserted = await em.execute({
      insert: b,
      values: {
        title: "Timezones",
        author: "a:1",
        publishedAt: winter,
        timestampTzs: [winter, summer],
        maybeTimestampTzs: [summer, winter],
      },
      returning: { publishedAt: b.publishedAt, instants: b.timestampTzs, maybeInstants: b.maybeTimestampTzs },
    });

    // Then PostgreSQL preserves each instant while RETURNING uses the session's UTC zone
    expectTypeOf(inserted.rows[0].publishedAt).toEqualTypeOf<Temporal.ZonedDateTime>();
    expectTypeOf(inserted.rows[0].instants).toEqualTypeOf<Temporal.ZonedDateTime[]>();
    expectTypeOf(inserted.rows[0].maybeInstants).toEqualTypeOf<Temporal.ZonedDateTime[] | null>();
    expect(inserted).toEqual({
      rowCount: 1,
      rows: [
        {
          publishedAt: winter.withTimeZone("UTC"),
          instants: [winter.withTimeZone("UTC"), summer.withTimeZone("UTC")],
          maybeInstants: [summer.withTimeZone("UTC"), winter.withTimeZone("UTC")],
        },
      ],
    });
    expect(inserted.rows[0].publishedAt.epochNanoseconds).toBe(winter.epochNanoseconds);
    expect(inserted.rows[0].instants[0]).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(inserted.rows[0].instants.map((instant) => instant.toString())).toEqual([
      "2018-01-01T18:00:00.123456+00:00[UTC]",
      "2018-07-01T17:00:00.654321+00:00[UTC]",
    ]);

    // When a physical and a derived compound predicate compare zoned array elements
    const branch = { from: b, select: { instants: b.timestampTzs } };
    const instants = query({ union: [branch, branch], as: "instants" });
    const direct = await em.query({ from: b, where: b.timestampTzs.eq([winter, summer]), select: b.timestampTzs });
    const combined = await em.query({
      from: instants,
      where: instants.instants.eq([winter, summer]),
      select: instants,
    });
    // Then timezone offsets encode as instants and decode with the session's UTC zone
    expect(direct).toEqual([inserted.rows[0].instants]);
    expect(combined).toEqual([{ instants: inserted.rows[0].instants }]);
    expectTypeOf(combined[0].instants).toEqualTypeOf<Temporal.ZonedDateTime[]>();

    // When updating the scalar and both arrays with different instants
    const updated = await em.execute({
      update: b,
      set: { publishedAt: summer, timestampTzs: [summer], maybeTimestampTzs: [winter] },
      where: b.id.eq("b:1"),
      returning: b.timestampTzs,
    });

    // Then scalar array RETURNING is an array-valued row, not a flattened or wrapped projection
    expectTypeOf(updated).toEqualTypeOf<ExecuteResult<Temporal.ZonedDateTime[]>>();
    expect(updated).toEqual({ rowCount: 1, rows: [[summer.withTimeZone("UTC")]] });
    expect(await knex("book").select("published_at", "timestamp_tzs", "maybe_timestamp_tzs")).toEqual([
      {
        published_at: "2018-07-01 17:00:00.654321+00",
        timestamp_tzs: ["2018-07-01 17:00:00.654321+00"],
        maybe_timestamp_tzs: ["2018-01-01 18:00:00.123456+00"],
      },
    ]);
    expect(em.entities).toEqual([]);
  });

  it("distinguishes Author bulk VALUES nulls, empty arrays, omission, undefined, and SQL DEFAULT", async () => {
    // Given imports whose nullable Temporal fields have real midnight and empty-array SQL defaults
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const a = alias(Author);
    resetQueryCount();

    // When rows deliberately supply different keys in one VALUES statement
    const result = await em.execute({
      insert: a,
      values: [
        {
          firstName: "Null",
          birthday: jan1,
          time: null,
          maybeBirthdays: null,
          maybeTimes: null,
          maybeTimestamps: null,
        },
        { firstName: "Empty", birthday: jan1, maybeBirthdays: [], maybeTimes: [], maybeTimestamps: [] },
        { firstName: "Omitted", birthday: jan1 },
        {
          firstName: "Undefined",
          birthday: jan1,
          time: undefined,
          timestamp: undefined,
          maybeBirthdays: undefined,
          maybeTimes: undefined,
          maybeTimestamps: undefined,
        },
        {
          firstName: "Default",
          birthday: jan1,
          time: sql<Temporal.PlainTime>`DEFAULT`,
          maybeBirthdays: sql<Temporal.PlainDate[]>`DEFAULT`,
          maybeTimes: sql<Temporal.PlainTime[]>`DEFAULT`,
          maybeTimestamps: sql<Temporal.PlainDateTime[]>`DEFAULT`,
        },
      ],
      returning: {
        time: a.time,
        birthdays: a.maybeBirthdays,
        times: a.maybeTimes,
        timestamps: a.maybeTimestamps,
        timestamp: a.timestamp,
        createdAt: a.createdAt,
      },
    });

    // Then null bypasses the array codecs while missing cells use DEFAULT, not SQL NULL
    expect(result.rowCount).toBe(5);
    expect(result.rows).toMatchObject([
      { time: null, birthdays: null, times: null, timestamps: null },
      { birthdays: [], times: [], timestamps: [] },
      { birthdays: [], times: [], timestamps: [] },
      { birthdays: [], times: [], timestamps: [] },
      { birthdays: [], times: [], timestamps: [] },
    ]);
    expect(result.rows.map((row) => row.time?.toString() ?? null)).toEqual([
      null,
      "00:00:00",
      "00:00:00",
      "00:00:00",
      "00:00:00",
    ]);
    for (const row of result.rows) {
      expect(row.timestamp).toBeInstanceOf(Temporal.PlainDateTime);
      expect(row.createdAt).toBeInstanceOf(Temporal.ZonedDateTime);
    }
    expect(queries).toMatchInlineSnapshot(`
     [
       "INSERT INTO authors AS a ("firstName", birthday, maybe_birthdays, maybe_timestamps, time, maybe_times) VALUES ($1, $2, NULL, NULL, NULL, NULL), ($3, $4, $5, $6, DEFAULT, $7), ($8, $9, DEFAULT, DEFAULT, DEFAULT, DEFAULT), ($10, $11, DEFAULT, DEFAULT, DEFAULT, DEFAULT), ($12, $13, DEFAULT, DEFAULT, DEFAULT, DEFAULT) RETURNING a.time AS time, a.maybe_birthdays AS birthdays, a.maybe_times AS times, a.maybe_timestamps AS timestamps, a.timestamp AS timestamp, a.created_at AS "createdAt"",
     ]
    `);
    expect(
      await knex("authors")
        .select(
          "time",
          "children_birthdays",
          "times",
          "timestamps",
          "maybe_birthdays",
          "maybe_times",
          "maybe_timestamps",
        )
        .orderBy("id"),
    ).toEqual([
      {
        time: null,
        children_birthdays: [],
        times: [],
        timestamps: [],
        maybe_birthdays: null,
        maybe_times: null,
        maybe_timestamps: null,
      },
      {
        time: "00:00:00",
        children_birthdays: [],
        times: [],
        timestamps: [],
        maybe_birthdays: [],
        maybe_times: [],
        maybe_timestamps: [],
      },
      {
        time: "00:00:00",
        children_birthdays: [],
        times: [],
        timestamps: [],
        maybe_birthdays: [],
        maybe_times: [],
        maybe_timestamps: [],
      },
      {
        time: "00:00:00",
        children_birthdays: [],
        times: [],
        timestamps: [],
        maybe_birthdays: [],
        maybe_times: [],
        maybe_timestamps: [],
      },
      {
        time: "00:00:00",
        children_birthdays: [],
        times: [],
        timestamps: [],
        maybe_birthdays: [],
        maybe_times: [],
        maybe_timestamps: [],
      },
    ]);
  });

  it("distinguishes Book bulk VALUES nulls and empty arrays from omitted or undefined defaults", async () => {
    // Given a persisted Author for Books whose zoned arrays default to empty arrays
    await knex("authors").insert({ firstName: "Owner", birthday: "2018-01-01" });
    const em = newEntityManager();
    const b = alias(Book);

    // When importing null, empty, omitted, and undefined zoned arrays in one statement
    const result = await em.execute({
      insert: b,
      values: [
        { title: "Null", author: "a:1", publishedAt: jan2DateTime, maybeTimestampTzs: null, deletedAt: null },
        { title: "Empty", author: "a:1", publishedAt: jan2DateTime, timestampTzs: [], maybeTimestampTzs: [] },
        { title: "Omitted", author: "a:1", publishedAt: jan2DateTime },
        {
          title: "Undefined",
          author: "a:1",
          publishedAt: jan2DateTime,
          timestampTzs: undefined,
          maybeTimestampTzs: undefined,
        },
      ],
      returning: { instants: b.timestampTzs, maybeInstants: b.maybeTimestampTzs, deletedAt: b.deletedAt },
    });

    // Then SQL NULL stays distinct from both explicitly empty and server-defaulted arrays
    expect(result).toEqual({
      rowCount: 4,
      rows: [
        { instants: [], maybeInstants: null, deletedAt: null },
        { instants: [], maybeInstants: [], deletedAt: null },
        { instants: [], maybeInstants: [], deletedAt: null },
        { instants: [], maybeInstants: [], deletedAt: null },
      ],
    });
    expect(await knex("book").select("timestamp_tzs", "maybe_timestamp_tzs").orderBy("id")).toEqual([
      { timestamp_tzs: [], maybe_timestamp_tzs: null },
      { timestamp_tzs: [], maybe_timestamp_tzs: [] },
      { timestamp_tzs: [], maybe_timestamp_tzs: [] },
      { timestamp_tzs: [], maybe_timestamp_tzs: [] },
    ]);
  });

  it.each([
    { field: "maybeBirthdays" as const, value: "2018-01-02" },
    { field: "maybeTimes" as const, value: "10:01:00.123456" },
    { field: "maybeTimestamps" as const, value: "2018-01-01T11:00:00" },
  ])("preserves scalar array RETURNING and UPDATE omission, null, and DEFAULT for Author.$field", async (testCase) => {
    // Given an Author with nonempty values in each nullable physical Temporal array
    const em = newEntityManager();
    const a = alias(Author);
    const inserted = await em.execute({
      insert: a,
      values: {
        firstName: "Arrays",
        birthday: jan1,
        maybeBirthdays: [jan2],
        maybeTimes: [ten01AndMicros],
        maybeTimestamps: [jan1at11am],
      },
      returning: a[testCase.field],
    });
    // And the selected nullable column supplies its real array decoder to scalar RETURNING
    const returning = a[testCase.field];

    // When replacing the selected array with an empty domain array
    const empty = await em.execute({
      update: a,
      set: { maybeBirthdays: [], maybeTimes: [], maybeTimestamps: [] },
      where: a.id.eq("a:1"),
      returning,
    });
    // And a later update explicitly stores SQL NULL instead of the column's empty-array default
    const absent = await em.execute({
      update: a,
      set: { maybeBirthdays: null, maybeTimes: null, maybeTimestamps: null },
      where: a.id.eq("a:1"),
      returning,
    });
    // And undefined must leave SQL NULL unchanged rather than restoring its default
    const omitted = await em.execute({
      update: a,
      set: {
        firstName: "Retained null",
        maybeBirthdays: undefined,
        maybeTimes: undefined,
        maybeTimestamps: undefined,
      },
      where: a.id.eq("a:1"),
      returning,
    });
    // And explicit SQL DEFAULT restores the physical empty-array default
    const defaulted = await em.execute({
      update: a,
      set: {
        maybeBirthdays: sql<Temporal.PlainDate[]>`DEFAULT`,
        maybeTimes: sql<Temporal.PlainTime[]>`DEFAULT`,
        maybeTimestamps: sql<Temporal.PlainDateTime[]>`DEFAULT`,
      },
      where: a.id.eq("a:1"),
      returning,
    });

    // Then each array-valued scalar result preserves its null or empty-array identity
    expect(inserted.rowCount).toBe(1);
    expect(inserted.rows).toHaveLength(1);
    expect(inserted.rows[0]!.map((value) => value.toString())).toEqual([testCase.value]);
    expect(empty).toEqual({ rowCount: 1, rows: [[]] });
    expect(absent).toEqual({ rowCount: 1, rows: [null] });
    expect(omitted).toEqual({ rowCount: 1, rows: [null] });
    expect(defaulted).toEqual({ rowCount: 1, rows: [[]] });
  });

  it("preserves scalar zoned array RETURNING through empty, null, omitted, and DEFAULT updates", async () => {
    // Given a persisted Author for a Book with a nonempty nullable zoned array
    await knex("authors").insert({ firstName: "Owner", birthday: "2018-01-01" });
    // And the Book starts with a concrete publication instant in the nullable array
    const em = newEntityManager();
    const b = alias(Book);
    await em.execute({
      insert: b,
      values: { title: "Instants", author: "a:1", publishedAt: jan2DateTime, maybeTimestampTzs: [jan2DateTime] },
    });

    // When replacing the nullable array with an empty array
    const empty = await em.execute({
      update: b,
      set: { maybeTimestampTzs: [] },
      where: b.id.eq("b:1"),
      returning: b.maybeTimestampTzs,
    });
    // And a second UPDATE stores SQL NULL instead of an array
    const absent = await em.execute({
      update: b,
      set: { maybeTimestampTzs: null },
      where: b.id.eq("b:1"),
      returning: b.maybeTimestampTzs,
    });
    // And an undefined assignment leaves that SQL NULL unchanged
    const omitted = await em.execute({
      update: b,
      set: { title: "Retained null", maybeTimestampTzs: undefined },
      where: b.id.eq("b:1"),
      returning: b.maybeTimestampTzs,
    });
    // And explicit SQL DEFAULT restores the database's empty array
    const defaulted = await em.execute({
      update: b,
      set: { maybeTimestampTzs: sql<Temporal.ZonedDateTime[]>`DEFAULT` },
      where: b.id.eq("b:1"),
      returning: b.maybeTimestampTzs,
    });

    // Then scalar RETURNING preserves the zoned-array type and its SQL nullability
    expectTypeOf(absent).toEqualTypeOf<ExecuteResult<Temporal.ZonedDateTime[] | null>>();
    expect(empty).toEqual({ rowCount: 1, rows: [[]] });
    expect(absent).toEqual({ rowCount: 1, rows: [null] });
    expect(omitted).toEqual({ rowCount: 1, rows: [null] });
    expect(defaulted).toEqual({ rowCount: 1, rows: [[]] });
    expect(await knex("book").select("maybe_timestamp_tzs")).toEqual([{ maybe_timestamp_tzs: [] }]);
  });

  it("keeps an omitted PlainTime unchanged, stores explicit null, and restores SQL DEFAULT", async () => {
    // Given an Author with a nondefault microsecond time
    await knex("authors").insert({ firstName: "Time", birthday: "2018-01-01", time: "10:01:00.123456" });
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const a = alias(Author);
    resetQueryCount();

    // When updating another field while time is undefined
    const omitted = await em.execute({
      update: a,
      set: { firstName: "Renamed", time: undefined },
      where: a.id.eq("a:1"),
      returning: a.time,
    });
    // And explicit null clears the time instead of using midnight
    const absent = await em.execute({ update: a, set: { time: null }, where: a.id.eq("a:1"), returning: a.time });
    // And SQL DEFAULT requests midnight rather than omission
    const defaulted = await em.execute({
      update: a,
      set: { time: sql<Temporal.PlainTime>`DEFAULT` },
      where: a.id.eq("a:1"),
      returning: a.time,
    });

    // Then nullable scalar RETURNING reports all three distinct outcomes
    expectTypeOf(omitted).toEqualTypeOf<ExecuteResult<Temporal.PlainTime | null>>();
    expect(omitted.rowCount).toBe(1);
    expect(omitted.rows.map((time) => time?.toString())).toEqual(["10:01:00.123456"]);
    expect(absent).toEqual({ rowCount: 1, rows: [null] });
    expect(defaulted.rowCount).toBe(1);
    expect(defaulted.rows.map((time) => time?.toString())).toEqual(["00:00:00"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "UPDATE authors AS a SET "firstName" = $1 WHERE (a.id = $2) RETURNING a.time AS value",
       "UPDATE authors AS a SET time = NULL WHERE (a.id = $1) RETURNING a.time AS value",
       "UPDATE authors AS a SET time = DEFAULT WHERE (a.id = $1) RETURNING a.time AS value",
     ]
    `);
    expect(await knex("authors").select("time")).toEqual([{ time: "00:00:00" }]);
  });

  it.each([false, true])("copies ordinary scalar Temporal source columns with reusable query=%s", async (reusable) => {
    // Given an Author with all four scalar Temporal kinds, including microseconds and a non-UTC input offset
    await knex("authors").insert({
      firstName: "Source",
      birthday: "2018-01-02",
      time: "10:01:00.123456",
      timestamp: "2018-01-02 11:00:00.654321",
      created_at: "2018-01-01T10:00:00.123456-08:00",
    });
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const source = alias(Author);
    const target = alias(Author);
    // And the source deliberately orders domain keys differently from the target's physical columns
    const read = {
      from: source,
      where: source.id.eq("a:1"),
      select: {
        createdAt: source.createdAt,
        time: source.time,
        timestamp: source.timestamp,
        birthday: source.birthday,
        firstName: source.firstName,
      },
    };
    resetQueryCount();

    // When INSERT SELECT consumes the scalar-column read POJO or its reusable query value
    const result = await em.execute({
      insert: target,
      from: reusable ? query(read) : read,
      returning: {
        birthday: target.birthday,
        time: target.time,
        timestamp: target.timestamp,
        createdAt: target.createdAt,
      },
    });

    // Then one SQL statement copies each scalar without losing precision or swapping target fields
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([
      {
        birthday: jan2,
        time: ten01AndMicros,
        timestamp: Temporal.PlainDateTime.from("2018-01-02T11:00:00.654321"),
        createdAt: Temporal.ZonedDateTime.from("2018-01-01T18:00:00.123456+00:00[UTC]"),
      },
    ]);
    expect(result.rows[0].time!.toString()).toBe("10:01:00.123456");
    expect(queries).toMatchInlineSnapshot(`
      [
        "INSERT INTO authors AS a (\"firstName\", birthday, timestamp, time, created_at) SELECT sq.\"firstName\", sq.birthday, sq.timestamp, sq.time, sq.\"createdAt\" FROM (SELECT a.created_at AS \"createdAt\", a.time AS time, a.timestamp AS timestamp, a.birthday AS birthday, a.\"firstName\" AS \"firstName\" FROM authors AS a WHERE a.id = $1) AS sq RETURNING a.birthday AS birthday, a.time AS time, a.timestamp AS timestamp, a.created_at AS \"createdAt\"",
      ]
    `);
    expect(em.entities).toEqual([]);
  });

  it("copies native Author arrays through output, derived-column, and scalar-subquery wrappers without JS codecs", async () => {
    // Given an Author with ordered date, time, and local timestamp arrays containing microsecond values
    await knex("authors").insert({
      firstName: "Values",
      birthday: "2018-01-01",
      children_birthdays: ["2018-01-01", "2018-01-02"],
      times: ["10:01:00.123456", "11:02:00.654321"],
      timestamps: ["2018-01-01 10:00:00.123456", "2018-01-02 11:00:00.654321"],
    });
    // And two Authors with empty required arrays, the last of which will have no matching joined row
    await knex("authors").insert([
      { firstName: "Empty", birthday: "2018-01-01" },
      { firstName: "Null", birthday: "2018-01-01" },
    ]);
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const source = alias(Author, "source");
    const paired = alias(Author, "paired");
    const target = alias(Author);
    // And a reusable read whose LEFT join and scalar subquery both produce SQL NULL for the last Author
    const arrays = query({
      from: source,
      join: [{ left: paired, on: { and: [paired.id.eq(source.id), paired.id.ne("a:3")] } }],
      select: {
        firstName: source.firstName,
        birthday: source.birthday,
        childrenBirthdays: source.childrenBirthdays,
        times: source.times,
        timestamps: source.timestamps,
        maybeBirthdays: paired.childrenBirthdays,
        maybeTimestamps: paired.timestamps,
        maybeTimes: query({
          from: paired,
          where: { and: [paired.id.eq(source.id), paired.id.ne("a:3")] },
          select: paired.times,
        }),
      },
      as: "arrays",
    });
    // And all Temporal read, write, and filter codecs are observed only after the fixtures exist
    const decode = jest.spyOn(CustomSerdeAdapter.prototype, "mapFromDb");
    const encode = jest.spyOn(CustomSerdeAdapter.prototype, "mapToDbValue");
    const filter = jest.spyOn(CustomSerdeAdapter.prototype, "mapToDb");
    resetQueryCount();
    try {
      // When INSERT SELECT copies derived array columns and returns only scalar ids
      const result = await em.execute({
        insert: target,
        from: {
          from: arrays,
          select: {
            firstName: arrays.firstName,
            birthday: arrays.birthday,
            childrenBirthdays: arrays.childrenBirthdays,
            times: arrays.times,
            timestamps: arrays.timestamps,
            maybeBirthdays: arrays.maybeBirthdays,
            maybeTimes: arrays.maybeTimes,
            maybeTimestamps: arrays.maybeTimestamps,
          },
          orderBy: [{ asc: arrays.firstName }],
        },
        returning: target.id,
      });

      // Then no Temporal codec runs and each physical array stays inside the single SQL statement
      expect(result).toEqual({ rowCount: 3, rows: ["a:4", "a:5", "a:6"] });
      expect(decode).not.toHaveBeenCalled();
      expect(encode).not.toHaveBeenCalled();
      expect(filter).not.toHaveBeenCalled();
      expect(queries).toMatchInlineSnapshot(`
       [
         "INSERT INTO authors AS a ("firstName", birthday, children_birthdays, maybe_birthdays, timestamps, maybe_timestamps, times, maybe_times) SELECT sq."firstName", sq.birthday, sq."childrenBirthdays", sq."maybeBirthdays", sq.timestamps, sq."maybeTimestamps", sq.times, sq."maybeTimes" FROM (SELECT arrays."firstName" AS "firstName", arrays.birthday AS birthday, arrays."childrenBirthdays" AS "childrenBirthdays", arrays.times AS times, arrays.timestamps AS timestamps, arrays."maybeBirthdays" AS "maybeBirthdays", arrays."maybeTimes" AS "maybeTimes", arrays."maybeTimestamps" AS "maybeTimestamps" FROM (SELECT a."firstName" AS "firstName", a.birthday AS birthday, a.children_birthdays AS "childrenBirthdays", a.times AS times, a.timestamps AS timestamps, a1.children_birthdays AS "maybeBirthdays", a1.timestamps AS "maybeTimestamps", (SELECT a2.times AS value FROM authors AS a2 WHERE a2.id = a.id AND a2.id != $1) AS "maybeTimes" FROM authors AS a LEFT OUTER JOIN authors AS a1 ON a1.id = a.id AND a1.id != $2) AS arrays ORDER BY arrays."firstName" ASC) AS sq RETURNING a.id AS value",
       ]
      `);
      expect(
        await knex("authors")
          .where("id", ">", 3)
          .select("children_birthdays", "times", "timestamps", "maybe_birthdays", "maybe_times", "maybe_timestamps")
          .orderBy("id"),
      ).toEqual([
        {
          children_birthdays: [],
          times: [],
          timestamps: [],
          maybe_birthdays: [],
          maybe_times: [],
          maybe_timestamps: [],
        },
        {
          children_birthdays: [],
          times: [],
          timestamps: [],
          maybe_birthdays: null,
          maybe_times: null,
          maybe_timestamps: null,
        },
        {
          children_birthdays: ["2018-01-01", "2018-01-02"],
          times: ["10:01:00.123456", "11:02:00.654321"],
          timestamps: ["2018-01-01 10:00:00.123456", "2018-01-02 11:00:00.654321"],
          maybe_birthdays: ["2018-01-01", "2018-01-02"],
          maybe_times: ["10:01:00.123456", "11:02:00.654321"],
          maybe_timestamps: ["2018-01-01 10:00:00.123456", "2018-01-02 11:00:00.654321"],
        },
      ]);
      expect(em.entities).toEqual([]);
    } finally {
      decode.mockRestore();
      encode.mockRestore();
      filter.mockRestore();
    }
  });

  it.each([false, true])("copies native zoned arrays entirely in SQL with reusable query=%s", async (reusable) => {
    // Given a persisted Author for three source Books
    await knex("authors").insert({ firstName: "Owner", birthday: "2018-01-01" });
    // And Books with ordered zoned instants, empty arrays, and explicit SQL NULL instead of the empty-array default
    await knex("book").insert([
      {
        title: "Values",
        author_id: 1,
        published_at: "2018-07-01T10:00:00.123456-07:00",
        timestamp_tzs: ["2018-01-01T10:00:00.123456-08:00", "2018-07-01T10:00:00.654321-07:00"],
        maybe_timestamp_tzs: ["2018-07-01T10:00:00.654321-07:00", "2018-01-01T10:00:00.123456-08:00"],
      },
      {
        title: "Empty",
        author_id: 1,
        published_at: "2018-01-01T00:00:00Z",
        timestamp_tzs: [],
        maybe_timestamp_tzs: [],
      },
      {
        title: "Null",
        author_id: 1,
        published_at: "2018-01-01T00:00:00Z",
        timestamp_tzs: [],
        maybe_timestamp_tzs: null,
      },
    ]);
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const source = alias(Book);
    const target = alias(Book);
    // And the read retains the required Author-id domain alongside both native array columns
    const read = {
      from: source,
      select: {
        author: source.author,
        publishedAt: source.publishedAt,
        title: source.title,
        timestampTzs: source.timestampTzs,
        maybeTimestampTzs: source.maybeTimestampTzs,
      },
      orderBy: [{ asc: source.id }],
    };
    // And all Temporal codecs are observed after raw SQL has established the source values
    const decode = jest.spyOn(CustomSerdeAdapter.prototype, "mapFromDb");
    const encode = jest.spyOn(CustomSerdeAdapter.prototype, "mapToDbValue");
    const filter = jest.spyOn(CustomSerdeAdapter.prototype, "mapToDb");
    resetQueryCount();
    try {
      // When INSERT SELECT receives the ordinary read object or its reusable query value
      const result = await em.execute({ insert: target, from: reusable ? query(read) : read, returning: target.id });

      // Then both timezone offsets retain microseconds without a JavaScript array round-trip
      expect(result).toEqual({ rowCount: 3, rows: ["b:4", "b:5", "b:6"] });
      expect(decode).not.toHaveBeenCalled();
      expect(encode).not.toHaveBeenCalled();
      expect(filter).not.toHaveBeenCalled();
      expect(queries).toMatchInlineSnapshot(`
       [
         "INSERT INTO book AS b (title, published_at, timestamp_tzs, maybe_timestamp_tzs, author_id) SELECT sq.title, sq."publishedAt", sq."timestampTzs", sq."maybeTimestampTzs", sq.author FROM (SELECT b.author_id AS author, b.published_at AS "publishedAt", b.title AS title, b.timestamp_tzs AS "timestampTzs", b.maybe_timestamp_tzs AS "maybeTimestampTzs" FROM book AS b WHERE b.deleted_at IS NULL ORDER BY b.id ASC) AS sq RETURNING b.id AS value",
       ]
      `);
      expect(
        await knex("book")
          .where("id", ">", 3)
          .select("author_id", "timestamp_tzs", "maybe_timestamp_tzs")
          .orderBy("id"),
      ).toEqual([
        {
          author_id: 1,
          timestamp_tzs: ["2018-01-01 18:00:00.123456+00", "2018-07-01 17:00:00.654321+00"],
          maybe_timestamp_tzs: ["2018-07-01 17:00:00.654321+00", "2018-01-01 18:00:00.123456+00"],
        },
        { author_id: 1, timestamp_tzs: [], maybe_timestamp_tzs: [] },
        { author_id: 1, timestamp_tzs: [], maybe_timestamp_tzs: null },
      ]);
      expect(em.entities).toEqual([]);
    } finally {
      decode.mockRestore();
      encode.mockRestore();
      filter.mockRestore();
    }
  });

  it.each(["domain", "storage"] as const)("rejects native array %s mismatches before SQL", async (mismatch) => {
    // Given a source projection that retains the actual PlainTime[] column metadata
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const source = alias(Author);
    const read = {
      from: source,
      select: { firstName: source.firstName, birthday: source.birthday, maybeTimes: source.maybeTimes },
    };
    // And a target that differs either in mapper identity for time[] or in SQL storage for the same PlainTime mapper
    const columns = getMetadata(Author).fields.maybeTimes.serde!.columns;
    const original = columns[0];
    columns[0] =
      mismatch === "domain"
        ? new CustomSerdeAdapter(
            "maybeTimes",
            "maybe_times",
            "time[]",
            {
              fromDb: (value: string) => Temporal.PlainTime.from(value),
              toDb: (value: Temporal.PlainTime) => value.toString(),
            },
            true,
            true,
          )
        : new PlainTimeSerde("maybeTimes", "maybe_times", "timetz[]", true, true);
    // And the changed codec still describes the same nullable column and SQL default
    Object.assign(columns[0], {
      sqlNullable: original.sqlNullable,
      hasDefault: original.hasDefault,
      isGenerated: original.isGenerated,
    });
    resetQueryCount();
    try {
      // When copying the source array despite deliberately incompatible target metadata
      // Then compatibility fails before PostgreSQL receives a read or write statement
      await expect(em.execute({ insert: alias(Author), from: read })).rejects.toThrow(
        "INSERT SELECT Author.maybeTimes has incompatible or unknown storage codecs",
      );
      expect(queries).toEqual([]);
    } finally {
      columns[0] = original;
    }
  });

  it("copies a Book's scalar publication instant and required Author reference entirely in SQL", async () => {
    // Given a persisted Author for the source Book
    await knex("authors").insert({ firstName: "Owner", birthday: "2018-01-01" });
    // And a Book with a non-UTC publication instant and microsecond precision
    await knex("book").insert({ title: "Source", author_id: 1, published_at: "2018-07-01T10:00:00.123456-07:00" });
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const source = alias(Book);
    const target = alias(Book);
    resetQueryCount();

    // When INSERT SELECT copies only scalar source fields and lets the array columns use SQL defaults
    const result = await em.execute({
      insert: target,
      from: {
        from: source,
        where: source.id.eq("b:1"),
        select: { author: source.author, publishedAt: source.publishedAt, title: source.title },
      },
      returning: target.publishedAt,
    });

    // Then scalar RETURNING decodes the copied instant and the SQL retains the required foreign key
    expectTypeOf(result).toEqualTypeOf<ExecuteResult<Temporal.ZonedDateTime>>();
    expect(result).toEqual({
      rowCount: 1,
      rows: [Temporal.ZonedDateTime.from("2018-07-01T17:00:00.123456+00:00[UTC]")],
    });
    expect(queries).toMatchInlineSnapshot(`
     [
       "INSERT INTO book AS b (title, published_at, author_id) SELECT sq.title, sq."publishedAt", sq.author FROM (SELECT b.author_id AS author, b.published_at AS "publishedAt", b.title AS title FROM book AS b WHERE b.id = $1 AND b.deleted_at IS NULL) AS sq RETURNING b.published_at AS value",
     ]
    `);
    expect(await knex("book").select("author_id", "timestamp_tzs", "maybe_timestamp_tzs").orderBy("id")).toEqual([
      { author_id: 1, timestamp_tzs: [], maybe_timestamp_tzs: [] },
      { author_id: 1, timestamp_tzs: [], maybe_timestamp_tzs: [] },
    ]);
  });

  it("accepts scalar Temporal subqueries in VALUES and UPDATE with independent source scope", async () => {
    // Given an Author whose scalar Temporal values can be copied without decoding source rows in JavaScript
    await knex("authors").insert({
      firstName: "Source",
      birthday: "2018-01-02",
      time: "10:01:00.123456",
      timestamp: "2018-01-01 11:00:00",
      created_at: "2018-01-02T00:00:00Z",
    });
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const a = alias(Author);
    // And the same alias handle belongs to each subquery's lexical source, not the new target row
    const birthday = query({ from: a, where: a.id.eq("a:1"), select: a.birthday }).coalesce(jan1);
    const time = query({ from: a, where: a.id.eq("a:1"), select: a.time });
    const timestamp = query({ from: a, where: a.id.eq("a:1"), select: a.timestamp }).coalesce(jan1at10am);
    const createdAt = query({ from: a, where: a.id.eq("a:1"), select: a.createdAt }).coalesce(jan2DateTime);
    resetQueryCount();

    // When VALUES assigns all four kinds from ordinary scalar subqueries
    const inserted = await em.execute({
      insert: a,
      values: { firstName: "Copied", birthday, time, timestamp, createdAt },
      returning: { birthday: a.birthday, time: a.time, timestamp: a.timestamp, createdAt: a.createdAt },
    });

    // Then RETURNING decodes the new row's Temporal columns, not raw strings or managed entities
    expect(inserted).toEqual({
      rowCount: 1,
      rows: [{ birthday: jan2, time: ten01AndMicros, timestamp: jan1at11am, createdAt: jan2DateTime }],
    });
    expect(inserted.rows[0].time!.toString()).toBe("10:01:00.123456");
    expect(queries).toMatchInlineSnapshot(`
     [
       "INSERT INTO authors AS a ("firstName", birthday, timestamp, time, created_at) VALUES ($1, coalesce((SELECT a1.birthday AS value FROM authors AS a1 WHERE a1.id = $2), $3), coalesce((SELECT a2.timestamp AS value FROM authors AS a2 WHERE a2.id = $4), $5), (SELECT a3.time AS value FROM authors AS a3 WHERE a3.id = $6), coalesce((SELECT a4.created_at AS value FROM authors AS a4 WHERE a4.id = $7), $8)) RETURNING a.birthday AS birthday, a.time AS time, a.timestamp AS timestamp, a.created_at AS "createdAt"",
     ]
    `);

    // And the original Author now has a different microsecond time, leaving the copied row unchanged
    await knex("authors").where("id", 1).update({ time: "11:02:00.654321" });
    resetQueryCount();
    // When UPDATE assigns a scalar source expression and returns that expression as a scalar
    const updated = await em.execute({ update: a, set: { time }, where: a.id.eq("a:2"), returning: time });

    // Then the scalar subquery retains its Temporal decoder in RETURNING as well as its source scope
    expectTypeOf(updated).toEqualTypeOf<ExecuteResult<Temporal.PlainTime | null>>();
    expect(updated.rowCount).toBe(1);
    expect(updated.rows.map((value) => value?.toString())).toEqual(["11:02:00.654321"]);
    expect(updated.rows[0]).toBeInstanceOf(Temporal.PlainTime);
    expect(queries).toMatchInlineSnapshot(`
     [
       "UPDATE authors AS a SET time = (SELECT a2.time AS value FROM authors AS a2 WHERE a2.id = $1) WHERE (a.id = $2) RETURNING (SELECT a1.time AS value FROM authors AS a1 WHERE a1.id = $3) AS value",
     ]
    `);
    expect(await knex("authors").select("time").orderBy("id")).toEqual([
      { time: "11:02:00.654321" },
      { time: "11:02:00.654321" },
    ]);

    // And an ordinary scalar query with no source rows yields SQL NULL
    const missing = query({ from: a, where: a.id.eq("a:999"), select: a.time });
    // When that empty source clears the copied Author's nullable time
    const cleared = await em.execute({
      update: a,
      set: { time: missing },
      where: a.id.eq("a:2"),
      returning: { time: a.time, source: missing },
    });

    // Then both target-column and scalar-subquery RETURNING preserve SQL NULL
    expect(cleared).toEqual({ rowCount: 1, rows: [{ time: null, source: null }] });
    expect(await knex("authors").select("time").orderBy("id")).toEqual([{ time: "11:02:00.654321" }, { time: null }]);
    expect(em.entities).toEqual([]);
  });
});
