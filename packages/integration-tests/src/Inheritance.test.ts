import {
  insertAuthor,
  insertLargePublisher,
  insertPublisher,
  insertPublisherGroup,
  insertPublisherToTag,
  insertSmallPublisher,
  insertTag,
} from "@src/entities/inserts";
import {
  Author,
  LargePublisher,
  newPublisher,
  newSmallPublisher,
  Publisher,
  PublisherGroup,
  SmallPublisher,
  Tag,
} from "./entities";
import { newEntityManager, testDriver } from "./setupDbTests";

describe("Inheritance", () => {
  it("can insert a subtype into two tables", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: "sp1" });
    await em.flush();
    expect(await testDriver.select("publishers")).toMatchObject([
      {
        id: 1,
        huge_number: null,
        latitude: null,
        longitude: null,
        name: "sp1",
        size_id: null,
        type_id: 1,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    ]);
    expect(await testDriver.select("small_publishers")).toMatchObject([
      {
        id: 1,
        city: "city",
      },
    ]);
  });

  // We cannot test this scenario anymore b/c we made `Publisher` abstract
  it.skip("can insert a base-only instance", async () => {
    const em = newEntityManager();
    newPublisher(em, { name: "sp1" });
    await em.flush();
    expect(await testDriver.select("publishers")).toMatchObject([
      {
        id: 1,
        huge_number: null,
        latitude: null,
        longitude: null,
        name: "sp1",
        size_id: null,
        type_id: 1,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    ]);
    expect(await testDriver.select("small_publishers")).toMatchObject([]);
  });

  it("can update a subtype across two tables", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp1" });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const sp = await em.load(SmallPublisher, "p:1");
    sp.name = "spa";
    sp.city = "citya";
    const lp = await em.load(LargePublisher, "p:2");
    lp.name = "lpa";
    lp.country = "countrya";
    await em.flush();

    expect(await testDriver.select("publishers")).toMatchObject([
      { id: 1, name: "spa" },
      { id: 2, name: "lpa" },
    ]);
    expect(await testDriver.select("small_publishers")).toMatchObject([{ id: 1, city: "citya" }]);
    expect(await testDriver.select("large_publishers")).toMatchObject([{ id: 2, country: "countrya" }]);
  });

  // We cannot test this scenario anymore b/c we made `Publisher` abstract
  it.skip("can update just base-only instance", async () => {
    await insertPublisher({ name: "p1" });

    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    expect(p).toBeInstanceOf(Publisher);
    expect(p).not.toBeInstanceOf(SmallPublisher);
    expect(p).not.toBeInstanceOf(LargePublisher);

    p.name = "pa";
    await em.flush();

    expect(await testDriver.select("publishers")).toMatchObject([{ id: 1, name: "pa" }]);
  });

  it("can load a subtype from separate tables via the base type", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp2" });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const sp = await em.load(Publisher, "p:1");
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    const lp = await em.load(Publisher, "p:2");
    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp2", country: "country" });
  });

  it("can load a subtype from separate tables via the sub type", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp2" });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const sp = await em.load(SmallPublisher, "p:1");
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });

    const lp = await em.load(LargePublisher, "p:2");
    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp).toMatchEntity({ name: "lp2", country: "country" });
  });

  it("cannot load a base-only instance that is abstract", async () => {
    await insertPublisher({ name: "sp1" });
    const em = newEntityManager();
    await expect(em.load(Publisher, "p:1")).rejects.toThrow("Publisher must be instantiated via a subtype");
  });

  it("can delete a subtype across separate tables", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });

    const em = newEntityManager();
    const sp = await em.load(Publisher, "p:1");
    em.delete(sp);
    await em.flush();
  });

  it("can load m2o across separate tables", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp1" });
    await insertLargePublisher({ id: 2, country: "country" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });

    const em = newEntityManager();
    const authors = await em.loadAll(Author, ["a:1", "a:2"], "publisher");

    const sp = authors[0].publisher.get;
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    const lp = authors[1].publisher.get;
    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it("can load o2m across separate tables", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertPublisher({ name: "sp1", group_id: 1 });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp1", group_id: 1 });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const pg = await em.load(PublisherGroup, "pg:1", "publishers");
    const [sp, lp] = pg.publishers.get;

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it("can load m2m across separate tables", async () => {
    await insertTag({ name: "t" });
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp1" });
    await insertLargePublisher({ id: 2, country: "country" });
    await insertPublisherToTag({ publisher_id: 1, tag_id: 1 });
    await insertPublisherToTag({ publisher_id: 2, tag_id: 1 });

    const em = newEntityManager();
    const tag = await em.load(Tag, "t:1", "publishers");
    const [sp, lp] = tag.publishers.get;

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it("can find entities from the base type", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp1" });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const [sp, lp] = await em.find(Publisher, { name: { like: "%p%" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it.skip("can find entities from the sub type", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp1" });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const [sp] = await em.find(SmallPublisher, { name: { like: "%p%" }, city: { like: "c%" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });
  });
});
