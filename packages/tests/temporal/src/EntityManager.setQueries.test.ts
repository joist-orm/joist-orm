import { Temporal, aliases, query } from "joist-orm";
import { Author, Book, newAuthor, newBook } from "src/entities";
import { knex, newEntityManager, queries, resetQueryCount } from "src/setupDbTests";
import {
  jan1,
  jan1DateTime,
  jan1at10am,
  jan1at11am,
  jan1at12pm,
  jan2,
  jan2DateTime,
  jan3,
  jan3DateTime,
  ten01AndMicros,
} from "src/utils";

describe("EntityManager.setQueries", () => {
  it("decodes same-field PlainDate, PlainTime, and PlainDateTime UNION outputs and preserves SQL NULL", async () => {
    // Given an Author with distinct date, microsecond time, and local timestamp values
    await knex
      .insert({ firstName: "a1", birthday: "2018-01-01", time: "10:01:00.123456", timestamp: "2018-01-01 10:00:00" })
      .into("authors");
    // And another Author with different date and timestamp values but SQL NULL instead of the default midnight time
    await knex
      .insert({ firstName: "a2", birthday: "2018-01-02", time: null, timestamp: "2018-01-01 11:00:00" })
      .into("authors");
    // And an EntityManager recording PostgreSQL queries from independent Author aliases
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const [a, other] = aliases(Author, Author);
    // And recording isolated from the Author inserts
    resetQueryCount();

    // When both branches select the same physical fields without entity hydration
    const rows = await em.query({
      union: [
        { from: a, select: { birthday: a.birthday, time: a.time, timestamp: a.timestamp } },
        { from: other, select: { birthday: other.birthday, time: other.time, timestamp: other.timestamp } },
      ],
      orderBy: { birthday: "ASC" },
    });

    // Then SQL deduplicates each row and each non-NULL field retains its Temporal domain
    expect(rows).toEqual([
      { birthday: jan1, time: ten01AndMicros, timestamp: jan1at10am },
      { birthday: jan2, time: null, timestamp: jan1at11am },
    ]);
    expect(rows[0].birthday).toBeInstanceOf(Temporal.PlainDate);
    expect(rows[0].time).toBeInstanceOf(Temporal.PlainTime);
    expect(rows[0].time!.toString()).toBe("10:01:00.123456");
    expect(rows[0].timestamp).toBeInstanceOf(Temporal.PlainDateTime);
    expect(queries).toMatchInlineSnapshot(`
      [
        "(SELECT a.birthday AS birthday, a.time AS time, a.timestamp AS timestamp FROM authors AS a) UNION (SELECT a1.birthday AS birthday, a1.time AS time, a1.timestamp AS timestamp FROM authors AS a1) ORDER BY birthday ASC",
      ]
    `);
  });

  it("subtracts equal instants with EXCEPT and decodes ZonedDateTime columns", async () => {
    // Given an Author for Books with recorded publication instants
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const author = newAuthor(em);
    // And a Book whose non-UTC publication value represents midnight UTC on January 1
    const removed = newBook(em, { author, publishedAt: jan1DateTime.withTimeZone("America/Los_Angeles") });
    // And another Book with the same instant expressed in UTC
    newBook(em, { author, publishedAt: jan1DateTime });
    // And a later publication that must survive subtraction
    newBook(em, { author, publishedAt: jan2DateTime });
    await em.flush();
    // And independent Book aliases with recording isolated from persistence
    const [b, other] = aliases(Book, Book);
    resetQueryCount();

    // When subtracting one Book's publication instant from all publication instants
    const rows = await em.query({
      except: [
        { from: b, select: { publishedAt: b.publishedAt } },
        { from: other, where: other.id.eq(removed.id), select: { publishedAt: other.publishedAt } },
      ],
    });

    // Then both representations of the removed instant disappear, leaving a decoded Temporal column
    expect(rows).toEqual([{ publishedAt: jan2DateTime }]);
    expect(rows[0].publishedAt).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(rows[0].publishedAt.epochNanoseconds).toBe(jan2DateTime.epochNanoseconds);
    expect(queries).toMatchInlineSnapshot(`
      [
        "(SELECT b.published_at AS \"publishedAt\" FROM book AS b WHERE b.deleted_at IS NULL) EXCEPT (SELECT b1.published_at AS \"publishedAt\" FROM book AS b1 WHERE b1.id = $1 AND b1.deleted_at IS NULL)",
      ]
    `);
  });

  it("encodes comparisons and coalesce bindings on returned Temporal columns", async () => {
    // Given an Author with a SQL NULL time and known date, local timestamp, and creation instant
    await knex
      .insert({
        firstName: "a1",
        birthday: "2018-01-01",
        time: null,
        timestamp: "2018-01-01 10:00:00",
        created_at: "2018-01-01T00:00:00Z",
      })
      .into("authors");
    // And another Author with the same dates but a nonmatching time, so the outer time predicate must filter it
    await knex
      .insert({
        firstName: "a2",
        birthday: "2018-01-01",
        time: "10:02:00",
        timestamp: "2018-01-01 10:00:00",
        created_at: "2018-01-01T00:00:00Z",
      })
      .into("authors");
    // And a recorded EntityManager with independent aliases for the same four Temporal fields
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    const [a, other] = aliases(Author, Author);
    // And a named compound exposing the agreed field codecs to the outer query
    const dates = query({
      union: [
        { from: a, select: { birthday: a.birthday, time: a.time, timestamp: a.timestamp, createdAt: a.createdAt } },
        {
          from: other,
          select: {
            birthday: other.birthday,
            time: other.time,
            timestamp: other.timestamp,
            createdAt: other.createdAt,
          },
        },
      ],
      as: "dates",
    });
    // And a call-through driver spy for physical parameter values, isolated from the Author inserts
    const execute = jest.spyOn(em.driver, "executeQuery");
    resetQueryCount();
    try {
      // When comparing returned columns with Temporal values and binding a fallback in each Temporal domain
      const rows = await em.query({
        from: dates,
        where: {
          and: [
            dates.birthday.eq(jan1),
            dates.timestamp.eq(jan1at10am),
            dates.createdAt.eq(jan1DateTime.withTimeZone("America/Los_Angeles")),
            { or: [dates.time.eq(ten01AndMicros), dates.time.eq(null)] },
          ],
        },
        select: {
          birthday: dates.birthday.coalesce(jan3),
          time: dates.time,
          fallback: dates.time.coalesce(ten01AndMicros),
          timestamp: dates.timestamp.coalesce(jan1at12pm),
          createdAt: dates.createdAt.coalesce(jan3DateTime.withTimeZone("America/Los_Angeles")),
        },
      });

      // Then NULL remains NULL in the direct projection, while the fallback decodes to a microsecond PlainTime
      expect(rows).toEqual([
        { birthday: jan1, time: null, fallback: ten01AndMicros, timestamp: jan1at10am, createdAt: jan1DateTime },
      ]);
      expect(rows[0].fallback).toBeInstanceOf(Temporal.PlainTime);
      expect(rows[0].fallback.toString()).toBe("10:01:00.123456");
      expect(rows[0].createdAt).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(queries).toMatchInlineSnapshot(`
        [
          "SELECT coalesce(dates.birthday, $1) AS birthday, dates.time AS time, coalesce(dates.time, $2) AS fallback, coalesce(dates.timestamp, $3) AS timestamp, coalesce(dates.\"createdAt\", $4) AS \"createdAt\" FROM ((SELECT a.birthday AS birthday, a.time AS time, a.timestamp AS timestamp, a.created_at AS \"createdAt\" FROM authors AS a) UNION (SELECT a1.birthday AS birthday, a1.time AS time, a1.timestamp AS timestamp, a1.created_at AS \"createdAt\" FROM authors AS a1)) AS dates WHERE dates.birthday = $5 AND dates.timestamp = $6 AND dates.\"createdAt\" = $7 AND (dates.time = $8 OR dates.time IS NULL)",
        ]
      `);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][2]).toEqual([
        "2018-01-03",
        "10:01:00.123456",
        "2018-01-01T12:00:00",
        "2018-01-02T16:00:00-08:00",
        "2018-01-01",
        "2018-01-01T10:00:00",
        "2017-12-31T16:00:00-08:00",
        "10:01:00.123456",
      ]);
    } finally {
      execute.mockRestore();
    }
  });

  it("rejects Temporal arrayAgg outputs before SQL", async () => {
    // Given Author and Book aliases for each scalar Temporal arrayAgg
    const [a, b] = aliases(Author, Book);
    // And a recorded EntityManager to detect execution before codec validation
    const em = newEntityManager({ onQuery: (sql) => queries.push(sql) });
    // And same-field branches for all four unsupported Temporal array domains
    const branches = [
      { from: a, select: { value: a.birthday.arrayAgg() } },
      { from: a, select: { value: a.time.arrayAgg() } },
      { from: a, select: { value: a.timestamp.arrayAgg() } },
      { from: b, select: { value: b.publishedAt.arrayAgg() } },
    ] as const;
    // And isolated recording so an empty log proves rejection before PostgreSQL
    resetQueryCount();

    for (const branch of branches) {
      // When constructing or executing a compound whose branches agree but lack a supported array codec
      // Then both entry points identify the unsupported output column without sending SQL
      expect(() => query({ union: [branch, branch] })).toThrow(
        "Set column 'value' has an unknown or unsupported output codec; sql<R> does not declare a SQL type or codec",
      );
      await expect(em.query({ union: [branch, branch] })).rejects.toThrow(
        "Set column 'value' has an unknown or unsupported output codec; sql<R> does not declare a SQL type or codec",
      );
      expect(queries).toEqual([]);
    }
  });
});
