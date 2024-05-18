import {
  Author,
  AuthorFilter,
  LargePublisher,
  newSmallPublisher,
  Publisher,
  PublisherGroup,
  PublisherGroupFilter,
  SmallPublisher,
} from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { alias, getMetadata, parseFindQuery } from "joist-orm";
import { insertAuthor, insertLargePublisher, insertPublisher, insertPublisherGroup } from "src/entities/inserts";

const am = getMetadata(Author);
const pgm = getMetadata(PublisherGroup);
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

  it("finds m2o against subtype", async () => {
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

  it("finds m2o against subtype and basetype", async () => {
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

  it("finds o2m against subtype", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertLargePublisher({ id: 1, name: "lp1", country: "US", group_id: 1 });
    const em = newEntityManager();
    const where = { publishersLargePublisher: { country: "US" } } satisfies PublisherGroupFilter;
    const groups = await em.find(PublisherGroup, where);
    expect(groups.length).toBe(1);
    expect(parseFindQuery(pgm, where, opts)).toMatchObject({
      selects: [`pg.*`],
      tables: [
        { alias: "pg", table: "publisher_groups", join: "primary" },
        { alias: "lp", table: "large_publishers", join: "outer", col1: "pg.id", col2: "lp.group_id" },
      ],
      condition: {
        op: "and",
        conditions: [{ alias: "lp", column: "country", dbType: "text", cond: { kind: "eq", value: "US" } }],
      },
      orderBys: [expect.anything()],
    });
  });
});
