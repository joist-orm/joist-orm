import { Changes, type FieldsOf, getProperties, type RelationsOf } from "joist-orm";
import {
  AdminUser,
  Author,
  Critic,
  LargePublisher,
  newAuthor,
  newBook,
  newLargePublisher,
  newPublisher,
  newPublisherGroup,
  newSmallPublisher,
  newSmallPublisherGroup,
  newUser,
  Publisher,
  PublisherGroup,
  PublisherOpts,
  SmallPublisher,
  SmallPublisherOpts,
  Tag,
  User,
} from "src/entities";
import {
  insertAuthor,
  insertCritic,
  insertLargePublisher,
  insertPublisher,
  insertPublisherGroup,
  insertPublisherOnly,
  insertPublisherToTag,
  insertSmallPublisherGroup,
  insertTag,
  insertUser,
  select,
} from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount, testDriver } from "src/testEm";
import { jan1 } from "./testDates";
import { zeroTo } from "./utils";

describe("ClassTableInheritance", () => {
  it("reports the right properties", () => {
    // And does not include the recursive selfReferential field which is configured to be skipped
    expect(Object.keys(getProperties(SmallPublisher.metadata))).toEqual(
      expect.arrayContaining([
        "allImages",
        "commentParentInfo",
        "smallPublishers",
        "users",
        "selfReferential",
        "sizeDetails",
        "isSizeSmall",
        "isSizeLarge",
        "typeDetails",
        "isTypeSmall",
        "isTypeBig",
        "authors",
        "bookAdvances",
        "comments",
        "images",
        "group",
        "tags",
        "tasks",
      ]),
    );
  });

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
        city: "default city",
      },
    ]);
  });

  // We cannot test this scenario anymore b/c we made `Publisher` abstract
  it("can insert a base-only instance", async () => {
    const em = newEntityManager();
    newUser(em, { name: "u1" });
    await em.flush();
    expect(await testDriver.select("users")).toMatchObject([{ id: 1 }]);
    expect(await testDriver.select("admin_users")).toMatchObject([]);
  });

  it("can update a subtype across two tables", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "sp1", updated_at: jan1 });
    await insertLargePublisher({ id: 2, name: "lp1", spotlight_author_id: 1 });

    const em = newEntityManager();
    const sp = await em.load(SmallPublisher, "p:1");
    sp.name = "spa";
    sp.city = "citya";
    const lp = await em.load(LargePublisher, "p:2");
    lp.name = "lpa";
    lp.country = "countrya";
    await em.flush();

    const baseRows = await testDriver.select("publishers");
    expect(baseRows).toMatchObject([
      { id: 1, name: "spa" },
      { id: 2, name: "lpa" },
    ]);
    expect(baseRows[0].updated_at.getTime() > jan1.getTime()).toBe(true);
    expect(baseRows[1].updated_at.getTime() > jan1.getTime()).toBe(true);
    expect(await testDriver.select("small_publishers")).toMatchObject([{ id: 1, city: "citya" }]);
    expect(await testDriver.select("large_publishers")).toMatchObject([{ id: 2, country: "countrya" }]);
  });

  it("can update just base-only instance", async () => {
    await insertUser({ name: "u1", email: "p1@sample.com", password: "password" });

    const em = newEntityManager();
    const u = await em.load(User, "u:1");
    expect(u).toBeInstanceOf(User);
    expect(u).not.toBeInstanceOf(AdminUser);

    u.name = "u2";
    await em.flush();

    const rows = await testDriver.select("users");
    expect(rows).toMatchObject([{ id: 1, name: "u2" }]);
  });

  it("updates updated_at on the base table", async () => {
    await insertPublisher({ name: "sp1", updated_at: jan1 });
    const em = newEntityManager();
    const sp = await em.load(SmallPublisher, "p:1");
    sp.city = "citya";
    await em.flush();
    const baseRows = await testDriver.select("publishers");
    expect(baseRows[0].updated_at.getTime() > jan1.getTime()).toBe(true);
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
    const sp = em.create(SmallPublisher, { name: "sp", city: "city" });
    expect(sp.transientFields.beforeFlushRan).toBe(false);
    expect(sp.transientFields.beforeCreateRan).toBe(false);
    expect(sp.transientFields.beforeUpdateRan).toBe(false);
    expect(sp.transientFields.afterCommitRan).toBe(false);
    expect(sp.transientFields.afterValidationRan).toBe(false);
    expect(sp.transientFields.beforeDeleteRan).toBe(false);
    await em.flush();
    expect(sp.transientFields.beforeFlushRan).toBe(true);
    expect(sp.transientFields.beforeCreateRan).toBe(true);
    expect(sp.transientFields.beforeUpdateRan).toBe(false);
    expect(sp.transientFields.beforeDeleteRan).toBe(false);
    expect(sp.transientFields.afterValidationRan).toBe(true);
    expect(sp.transientFields.afterCommitRan).toBe(true);
    sp.name = "new name";
    sp.transientFields.beforeCreateRan = false;
    await em.flush();
    expect(sp.transientFields.beforeCreateRan).toBe(false);
    expect(sp.transientFields.beforeUpdateRan).toBe(true);
    em.delete(sp);
    await em.flush();
    expect(sp.transientFields.beforeDeleteRan).toBe(true);
  });

  it("can load a subtype from separate tables via the base type", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp2", spotlight_author_id: 1 });

    const em = newEntityManager();
    const sp = await em.load(Publisher, "p:1");
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    const lp = await em.load(Publisher, "p:2");
    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp2", country: "country" });
  });

  it("can load a subtype from separate tables via the sub type", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp2", spotlight_author_id: 1 });

    const em = newEntityManager();
    const sp = await em.load(SmallPublisher, "p:1");
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });

    const lp = await em.load(LargePublisher, "p:2");
    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp).toMatchEntity({ name: "lp2", country: "country" });
  });

  it.skip("cannot load a base-only instance that is abstract", async () => {
    await insertPublisherOnly({ name: "sp1" });
    const em = newEntityManager();
    await expect(em.load(Publisher, "p:1")).rejects.toThrow("Publisher must be instantiated via a subtype");
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
    // spotlight_author_id is enforced in the runtime, not in the db, so it is safe to be invalid here since
    // we aren't asserting against spotlight author
    await insertLargePublisher({ id: 2, name: "lp1", spotlight_author_id: undefined as any });
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
    await insertAuthor({ first_name: "a1" });
    await insertPublisherGroup({ name: "pg1" });
    await insertPublisher({ name: "sp1", group_id: 1 });
    await insertLargePublisher({ id: 2, name: "lp1", group_id: 1, spotlight_author_id: 1 });

    const em = newEntityManager();
    const pg = await em.load(PublisherGroup, "pg:1", "publishers");
    const [sp, lp] = pg.publishers.get;

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it("can load m2m across separate tables", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "t" });
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", spotlight_author_id: 1 });
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

  it("can order by properties from the base type", async () => {
    await insertPublisher({ id: 1, name: "a" });
    await insertPublisher({ id: 2, name: "b" });

    const em = newEntityManager();
    const [b, a] = await em.find(SmallPublisher, {}, { orderBy: { name: "DESC" } });

    expect(a as SmallPublisher).toMatchEntity({ name: "a" });
    expect(b as SmallPublisher).toMatchEntity({ name: "b" });
  });

  it("can find entities from the base type", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", spotlight_author_id: 1 });

    const em = newEntityManager();
    const [sp, lp] = await em.find(Publisher, { name: { like: "%p%" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp as SmallPublisher).toMatchEntity({ name: "sp1", city: "city" });

    expect(lp).toBeInstanceOf(LargePublisher);
    expect(lp as LargePublisher).toMatchEntity({ name: "lp1", country: "country" });
  });

  it("can find entities from the sub type", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", country: "country", spotlight_author_id: 1 });

    const em = newEntityManager();
    const [sp] = await em.find(SmallPublisher, { name: { like: "%p%" }, city: { like: "c%" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });
  });

  it("can find entities from the sub type via base type m2o", async () => {
    await insertSmallPublisherGroup({ id: 1, name: "pg1" });
    await insertPublisher({ name: "sp1", group_id: 1 });

    const em = newEntityManager();
    const [sp] = await em.find(SmallPublisher, { group: { name: "pg1" } });

    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ name: "sp1", city: "city" });
  });

  it("can find entities from the sub type via a join", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", country: "country", spotlight_author_id: 1 });
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
    newSmallPublisher(em, { name: "sp1" });
    await em.flush();
    // Then the field was initialized
    expect(await select("small_publishers")).toMatchObject([{ all_author_names: null }]);
  });

  it("can ignore persisted fields from a different subtype", async () => {
    // Given a large publisher
    await insertAuthor({ first_name: "a1" });
    await insertLargePublisher({ name: "lp1", spotlight_author_id: 1 });
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

  it("can mark subtype fields as required", async () => {
    const em = newEntityManager();
    // Given a small publisher with no rating
    newSmallPublisher(em, { name: "lp1", rating: null as any });
    // When we flush
    const result = em.flush();
    // Then the flush succeeds because rating is not required
    await expect(result).resolves.not.toThrow();
    // But when we are given a large publisher with no spotlightAuthor
    newLargePublisher(em, { name: "lp1", rating: null as any });
    // Then the flush fails because rating is required
    await expect(em.flush()).rejects.toThrow("rating is required");
  });

  it("can mark subtype relations as required", async () => {
    const em = newEntityManager();
    // Given a small publisher with no spotlight author
    newSmallPublisher(em, { name: "lp1", spotlightAuthor: null as any });
    // When we flush
    const result = em.flush();
    // Then the flush succeeds because spotlight author is not required
    await expect(result).resolves.not.toThrow();
    // But when we are given a large publisher with no spotlightAuthor
    newLargePublisher(em, { name: "lp1", spotlightAuthor: null as any });
    // Then the flush fails because spotlight author is required
    await expect(em.flush()).rejects.toThrow("spotlightAuthor is required");
  });

  it("can cascade delete relations that are on the base type", async () => {
    const em = newEntityManager();
    // Given a large publisher
    const p = newPublisher(em);
    expect(p).toBeInstanceOf(LargePublisher);
    // And a book with a BookAdvance from the sp
    const b = newBook(em, { advances: [{ publisher: p }] });
    await em.flush();
    // When we delete the sp
    em.delete(p);
    await em.flush();
    // Then the book was not deleted
    expect(b.isDeletedEntity).toBe(false);
  });

  it("supports columns that are shared across subtypes", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ id: 1, name: "sp1", shared_column: "sp1" });
    await insertLargePublisher({ id: 2, name: "lp1", shared_column: "lp1", spotlight_author_id: 1 });
    await insertLargePublisher({ id: 3, name: "lp2", spotlight_author_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    const [sp1, lp1, lp2] = await em.find(Publisher, {}, { orderBy: { id: "ASC" } });
    expect((sp1 as SmallPublisher).sharedColumn).toBe("sp1");
    expect((lp1 as LargePublisher).sharedColumn).toBe("lp1");
    expect((lp2 as LargePublisher).sharedColumn).toBe(undefined);
    expect(queries[0]).toMatchInlineSnapshot(
      `"SELECT p.*, p_s0.*, p_s1.*, p.id as id, COALESCE(p_s0.shared_column, p_s1.shared_column) as shared_column, CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE '_' END as __class FROM publishers AS p LEFT OUTER JOIN large_publishers AS p_s0 ON p.id = p_s0.id LEFT OUTER JOIN small_publishers AS p_s1 ON p.id = p_s1.id WHERE p.deleted_at IS NULL ORDER BY p.id ASC LIMIT $1"`,
    );
  });

  it("can access base type metadata in afterMetadata", async () => {
    expect(SmallPublisher.afterMetadataHasBaseTypes).toBe(true);
  });

  it("can access sub type metadata in afterMetadata", async () => {
    expect(Publisher.afterMetadataHasSubTypes).toBe(true);
  });

  it("setDefaults work as expected for subtypes", async () => {
    const em = newEntityManager();
    const sp = newSmallPublisher(em, {});
    const lp = newLargePublisher(em, { authors: [{}] });
    await em.flush();

    const publishers = await select("publishers");
    expect(publishers.length).toEqual(2);
    // Then SmallPublisher persisted its defaults from the base class
    expect(publishers[0].id).toEqual(parseInt(sp.idUntagged));
    expect(publishers[0].base_sync_default).toEqual("BaseSyncDefault");
    expect(publishers[0].base_async_default).toEqual("BaseAsyncDefault");
    // And LargePublisher overrode the base class defaults and persisted its defaults
    expect(publishers[1].id).toEqual(parseInt(lp.idUntagged));
    expect(publishers[1].base_async_default).toEqual("LPAsyncDefault");
    expect(publishers[1].base_sync_default).toEqual("LPSyncDefault");

    // And the entities reflect the values
    expect(sp).toMatchEntity({
      baseSyncDefault: "BaseSyncDefault",
      baseAsyncDefault: "BaseAsyncDefault",
    });
    expect(lp).toMatchEntity({
      baseSyncDefault: "LPSyncDefault",
      baseAsyncDefault: "LPAsyncDefault",
    });
  });

  it("can find authors by fields on a sub type", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { city: "Denver", authors: [{}] });
    const sp2 = newSmallPublisher(em, { city: "Houston", authors: [{}] });
    const lp1 = newLargePublisher(em, { country: "USA!!", authors: [{}] });
    const lp2 = newLargePublisher(em, { country: "CANADA!!", authors: [{}] });
    await em.flush();

    // When I search for authors by fields on the sub type, then expected authors are returned
    expect(await em.find(Author, { publisherLargePublisher: { country: "USA!!" } })).toMatchEntity(lp1.authors.get);
    expect(await em.find(Author, { publisherSmallPublisher: { city: "Denver" } })).toMatchEntity(sp1.authors.get);

    // When I attempt to search for fields in different sub types
    expect(
      await em.find(Author, {
        publisherLargePublisher: { country: "USA!!" },
        publisherSmallPublisher: { city: "Denver" },
      }),
    )
      // Then no authors are returned, because none can be of both types
      .toMatchEntity([]);
  });

  it("can specialize a base type m2o", async () => {
    // Given we create a SmallPublisher
    const em = newEntityManager();
    const sp = newSmallPublisher(em, { group: {} });
    // Then we know it's group is a SmallPublisherGroup
    expect(sp.group.get?.smallName).toBe("small 1");
  });

  it("enforces a specialized base type m2o", async () => {
    // Given we create a SmallPublisher
    const em = newEntityManager();
    // And try to give a non-small group
    const pg = newPublisherGroup(em);
    newSmallPublisher(
      em,
      // Then we cannot get a type error due to Liskov subtyping restrictions
      { group: pg },
    );
    // But em.flush fails at runtime
    await expect(em.flush()).rejects.toThrow("group must be a SmallPublisherGroup not PublisherGroup#1");
  });

  it("can specialize a base type o2m", async () => {
    // Given we create a SmallPublisherGroup
    const em = newEntityManager();
    const spg = newSmallPublisherGroup(em, { publishers: [{}] });
    // Then we know it's publishers are SmallPublishers
    expect(spg.publishers.get[0].city).toBe("default city");
  });

  it("load throws on loading a small publisher as a large publisher", async () => {
    await insertPublisher({ name: "sp1" });
    const em = newEntityManager();
    await expect(em.load(LargePublisher, "p:1")).rejects.toThrow("p:1 was not found");
  });

  it("loadAll throws on loading a small publisher as a large publisher", async () => {
    await insertPublisher({ name: "sp1" });
    const em = newEntityManager();
    await expect(em.loadAll(LargePublisher, ["p:1"])).rejects.toThrow("p:1 were not found");
  });

  describe("types", () => {
    it("changes does not break covariance", () => {
      // Given a base type with a changes type
      type PublisherChanges = Changes<
        Publisher,
        | keyof (FieldsOf<Publisher> & RelationsOf<Publisher>)
        | keyof (FieldsOf<LargePublisher> & RelationsOf<LargePublisher>)
        | keyof (FieldsOf<SmallPublisher> & RelationsOf<SmallPublisher>)
      >;
      // And the subtype has its own as well
      type SmallPublisherChanges = Changes<SmallPublisher>;
      // When we return the changes covariantly
      type ReturnChange = () => PublisherChanges;
      const spChanges: SmallPublisherChanges = null!;
      // Then the subtype substitutes w/o errors
      const _: ReturnChange = () => spChanges;
    });

    it("set(opts) does not break contravariance", () => {
      // Given a base type with a set(opts) method
      type PublisherSetter = (opts: PublisherOpts) => void;
      // And the subtype overrides it with its own set(opts)
      type SmallPublisherSetter = (opts: SmallPublisherOpts) => void;
      // When we want to accept the setter contravariantly
      function setPublisher(_: PublisherSetter): void {}
      const spSetter: SmallPublisherSetter = null!;
      // Then the subtype substitutes w/o errors
      setPublisher(spSetter);
    });
  });
});
