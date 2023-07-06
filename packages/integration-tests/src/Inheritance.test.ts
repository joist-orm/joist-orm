import {
  insertAuthor,
  insertCritic,
  insertLargePublisher,
  insertPublisher,
  insertPublisherGroup,
  insertPublisherOnly,
  insertPublisherToTag,
  insertTag,
  select,
} from "@src/entities/inserts";
import { zeroTo } from "@src/utils";
import {
  Author,
  Critic,
  LargePublisher,
  Publisher,
  PublisherGroup,
  SmallPublisher,
  Tag,
  newAuthor,
  newLargePublisher,
  newPublisher,
  newSmallPublisher,
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
        type_id: 2,
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
    await insertLargePublisher({ id: 2, name: "lp1" });

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
    await insertPublisherOnly({ name: "p1" });

    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    expect(p).toBeInstanceOf(Publisher);
    expect(p).not.toBeInstanceOf(SmallPublisher);
    expect(p).not.toBeInstanceOf(LargePublisher);

    p.name = "pa";
    await em.flush();

    expect(await testDriver.select("publishers")).toMatchObject([{ id: 1, name: "pa" }]);
  });

  it("runs base type validation rules against the sub type", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: undefined } as any);
    await expect(em.flush()).rejects.toThrow("name is required");
  });

  it("runs subtype validation rules against the sub type", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: "large" });
    await expect(em.flush()).rejects.toThrow("name cannot be large");
  });

  it("runs hooks on subtypes", async () => {
    const em = newEntityManager();
    const sp = new SmallPublisher(em, { name: "sp", city: "city" });
    expect(sp.beforeFlushRan).toBeFalsy();
    expect(sp.beforeCreateRan).toBeFalsy();
    expect(sp.beforeUpdateRan).toBeFalsy();
    expect(sp.afterCommitRan).toBeFalsy();
    expect(sp.afterValidationRan).toBeFalsy();
    expect(sp.beforeDeleteRan).toBeFalsy();
    await em.flush();
    expect(sp.beforeFlushRan).toBeTruthy();
    expect(sp.beforeCreateRan).toBeTruthy();
    expect(sp.beforeUpdateRan).toBeFalsy();
    expect(sp.beforeDeleteRan).toBeFalsy();
    expect(sp.afterValidationRan).toBeTruthy();
    expect(sp.afterCommitRan).toBeTruthy();
    sp.name = "new name";
    sp.beforeCreateRan = false;
    await em.flush();
    expect(sp.beforeCreateRan).toBeFalsy();
    expect(sp.beforeUpdateRan).toBeTruthy();
    em.delete(sp);
    await em.flush();
    expect(sp.beforeDeleteRan).toBeTruthy();
  });

  it("can load a subtype from separate tables via the base type", async () => {
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp2" });

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
    await insertLargePublisher({ id: 2, name: "lp2" });

    const em = newEntityManager();
    const sp = await em.load(SmallPublisher, "p:1");
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });

    const lp = await em.load(LargePublisher, "p:2");
    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp).toMatchEntity({ name: "lp2", country: "country" });
  });

  it("cannot load a base-only instance that is abstract", async () => {
    await insertPublisherOnly({ name: "sp1" });
    const em = newEntityManager();
    await expect(em.load(Publisher, "p:1")).rejects.toThrow("Publisher p:1 must be instantiated via a subtype");
  });

  it("can delete a subtype across separate tables", async () => {
    await insertPublisher({ name: "sp1" });

    const em = newEntityManager();
    const sp = await em.load(Publisher, "p:1");
    em.delete(sp);
    await em.flush();
  });

  it("can load m2o across separate tables", async () => {
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1" });
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
    await insertLargePublisher({ id: 2, name: "lp1", group_id: 1 });

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
    await insertLargePublisher({ id: 2, name: "lp1" });
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
    await insertLargePublisher({ id: 2, name: "lp1" });

    const em = newEntityManager();
    const [sp, lp] = await em.find(Publisher, { name: { like: "%p%" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it("can find entities from the sub type", async () => {
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", country: "country" });

    const em = newEntityManager();
    const [sp] = await em.find(SmallPublisher, { name: { like: "%p%" }, city: { like: "c%" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });
  });

  it("can find entities from the sub type via base type m2o", async () => {
    await insertPublisherGroup({ name: "pg1" });
    await insertPublisher({ name: "sp1", group_id: 1 });

    const em = newEntityManager();
    const [sp] = await em.find(SmallPublisher, { group: { name: "pg1" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });
  });

  it("can find entities from the sub type via a join", async () => {
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", country: "country" });
    await insertCritic({ name: "c1", favorite_large_publisher_id: 2 });

    const em = newEntityManager();
    const [critic] = await em.find(
      Critic,
      { favoriteLargePublisher: { name: "lp1", country: "country" } },
      { populate: "favoriteLargePublisher" },
    );

    expect(critic.favoriteLargePublisher.get).toBeInstanceOf(LargePublisher);
  });

  it("can load through a subtype", async () => {
    await insertPublisher({ name: "sp1" });
    const em = newEntityManager();
    // Use regular load to avoid a DeepNew
    const sp = await em.load(SmallPublisher, "p:1", { authors: "books" });
    expect(sp.authors.get[0]?.books.get).toBeUndefined();
  });

  it("can recalc persisted fields on a subtype", async () => {
    // Given a small publisher
    const em = newEntityManager();
    // When we make an author
    const sp1 = newSmallPublisher(em);
    newAuthor(em, { publisher: sp1 });
    await em.flush();
    // Then the field is recacled
    expect(await select("small_publishers")).toMatchObject([{ all_author_names: "a1" }]);
  });

  it("can initialize persisted fields on a subtype", async () => {
    const em = newEntityManager();
    // Given a small publisher
    const sp = newSmallPublisher(em, { name: "sp1" });
    await em.flush();
    // Then the field was initialized
    expect(await select("small_publishers")).toMatchObject([{ all_author_names: "" }]);
  });

  it("can ignore persisted fields from a different subtype", async () => {
    // Given a large publisher
    await insertLargePublisher({ name: "lp1" });
    const em = newEntityManager();
    // When we make an author
    newAuthor(em, { publisher: "p:1" });
    // Then we can flush w/o blowing up on `allAuthorNames` is an invalid field
    await expect(em.flush()).resolves.toBeDefined();
  });

  it("can have reactive rules on a subtype", async () => {
    const em = newEntityManager();
    // Given a small publisher
    const sp = newSmallPublisher(em, { name: "sp1" });
    // When we make six authors
    zeroTo(6).forEach(() => newAuthor(em, { publisher: sp }));
    // Then the rule fails
    await expect(em.flush()).rejects.toThrow("SmallPublishers cannot have more than 5 authors");
  });

  it("ignores reactive rules from the other subtype", async () => {
    const em = newEntityManager();
    // Given a large publisher
    const lg = newLargePublisher(em, { name: "lp1" });
    // When we make six authors
    zeroTo(6).forEach(() => newAuthor(em, { publisher: lg }));
    // Then the rule isn't ran
    await expect(em.flush()).resolves.toBeDefined();
  });
});
