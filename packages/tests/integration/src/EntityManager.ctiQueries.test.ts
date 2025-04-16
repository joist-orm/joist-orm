import {
  AdvanceStatus,
  Author,
  AuthorFilter,
  BookAdvance,
  LargePublisher,
  newSmallPublisher,
  Publisher,
  SmallPublisher,
} from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { alias, aliases, getMetadata, parseFindQuery } from "joist-orm";
import {
  insertAuthor,
  insertBook,
  insertBookAdvance,
  insertLargePublisher,
  insertPublisher,
} from "src/entities/inserts";

const am = getMetadata(Author);
const bam = getMetadata(BookAdvance);
const opts = { softDeletes: "include" } as const;

describe("EntityManager.ctiQueries", () => {
  it("finds against child with simple parent filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1" });
    await em.flush();
    const res = await em.find(SmallPublisher, { name: "p1" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against parent with simple parent filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1" });
    await em.flush();
    const res = await em.find(Publisher, { name: "p1" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with simple child filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const res = await em.find(SmallPublisher, { city: "location" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with simple child & parent filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const res = await em.find(SmallPublisher, { name: "p1", city: "location" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with complex child & parent filter, alias child", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const sp = alias(SmallPublisher);
    const res = await em.find(SmallPublisher, { as: sp }, { conditions: { and: [sp.name.eq("p1")] } });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with simple child & parent filter, parent alias", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const p = alias(Publisher);
    const res = await em.find(SmallPublisher, { as: p }, { conditions: { and: [p.name.eq("p1")] } });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against both subtypes", async () => {
    await insertPublisher({ id: 1, name: "sp1" });
    await insertPublisher({ id: 2, name: "sp2" });
    const em = newEntityManager();
    const sps = await em.find(SmallPublisher, {});
    const lps = await em.find(LargePublisher, {});
    expect(sps).toMatchEntity([{}, {}]);
    expect(lps).toMatchEntity([]);
  });

  it("finds filters out soft-deleted entities if querying base table", async () => {
    await insertPublisher({ id: 1, name: "sp1", deleted_at: new Date() });
    const em = newEntityManager();
    const sps = await em.find(Publisher, {});
    expect(sps).toMatchEntity([]);
  });

  it.skip("finds filters out soft-deleted entities if querying child table", async () => {
    await insertPublisher({ id: 1, name: "sp1", deleted_at: new Date() });
    const em = newEntityManager();
    const sps = await em.find(SmallPublisher, {});
    expect(sps).toMatchEntity([]);
  });

  it("finds against subtype", async () => {
    await insertLargePublisher({ id: 1, name: "lp1", country: "US" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const where = { publisherLargePublisher: { country: "US" } } satisfies AuthorFilter;
    const authors = await em.find(Author, where);
    expect(authors.length).toBe(1);
    expect(parseFindQuery(am, where, { softDeletes: "include" })).toMatchObject({
      selects: [`a.*`],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        { alias: "lp", table: "large_publishers", join: "outer", col1: "a.publisher_id", col2: "lp.id" },
      ],
      condition: {
        op: "and",
        conditions: [{ alias: "lp", column: "country", dbType: "text", cond: { kind: "eq", value: "US" } }],
      },
      orderBys: [expect.anything()],
    });
  });

  it("finds against required subtype becomes left join", async () => {
    // Given we have two publishers, small & large
    await insertPublisher({ id: 1, name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    // And two BookAdvances, for each LP / SP
    await insertBookAdvance({ book_id: 1, publisher_id: 1 });
    await insertBookAdvance({ book_id: 2, publisher_id: 2 });
    const em = newEntityManager();
    // And we bind an alias to a subtype that we'll later use as an optional filter
    const [ba, lp] = aliases(BookAdvance, LargePublisher);
    const where = { as: ba, publisherLargePublisher: lp };
    const conditions = { or: [lp.name.eq("won't match"), ba.status.eq(AdvanceStatus.Pending)] };
    const bas = await em.find(BookAdvance, where, { conditions });
    // Then we should find both BookAdvances, b/c they're both pending
    expect(bas.length).toBe(2);
    expect(parseFindQuery(bam, where, { conditions, softDeletes: "include" })).toMatchObject({
      selects: [`ba.*`],
      tables: [
        { alias: "ba", table: "book_advances", join: "primary" },
        { alias: "lp", table: "large_publishers", join: "outer", col1: "ba.publisher_id", col2: "lp.id" },
        { alias: "lp_b0", table: "publishers", join: "outer", col1: "lp.id", col2: "lp_b0.id" },
      ],
      condition: {
        op: "or",
        conditions: [
          { alias: "lp_b0", column: "name", dbType: "character varying", cond: { kind: "eq", value: "won't match" } },
          { alias: "ba", column: "status_id", dbType: "int", cond: { kind: "eq", value: 1 } },
        ],
      },
      orderBys: [expect.anything()],
    });
  });

  it("finds against subtype and basetype", async () => {
    await insertLargePublisher({ id: 1, name: "lp1", country: "US" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const where = { publisherLargePublisher: { country: "US", name: "lp1" } } satisfies AuthorFilter;
    const authors = await em.find(Author, where);
    expect(authors.length).toBe(1);
    expect(parseFindQuery(am, where, opts)).toMatchObject({
      selects: [`a.*`],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        { alias: "lp", table: "large_publishers", join: "outer", col1: "a.publisher_id", col2: "lp.id" },
        { alias: "lp_b0", table: "publishers", join: "outer", col1: "lp.id", col2: "lp_b0.id" },
      ],
      condition: {
        op: "and",
        conditions: [
          { alias: "lp", column: "country", dbType: "text", cond: { kind: "eq", value: "US" } },
          { alias: "lp_b0", column: "name", dbType: "character varying", cond: { kind: "eq", value: "lp1" } },
        ],
      },
      orderBys: [expect.anything()],
    });
  });
});
