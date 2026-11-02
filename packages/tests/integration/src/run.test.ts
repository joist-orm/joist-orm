import { run } from "joist-test-utils";
import { Context } from "src/context";
import {
  AdvanceStatus,
  Author,
  Book,
  BookAdvance,
  Comment,
  LargePublisher,
  ParentGroup,
  User,
  newAuthor,
  newBook,
  newBookAdvance,
  newComment,
  newLargePublisher,
  newSmallPublisher,
  newUser,
} from "src/entities";
import { insertParentGroup } from "src/entities/inserts";

import { jan1, jan2 } from "./testDates";

describe("run", () => {
  it.withCtx("mirrors a Book-to-Author parent switch and clearing both inverse collections", async (ctx) => {
    // Given a Book with a Comment in its loaded comments collection
    const book = newBook(ctx.em);
    // And the Comment's parent is cached as the Book entity
    const comment = newComment(ctx.em, { parent: book });
    // And an Author with an empty loaded comments collection
    const author = newAuthor(ctx.em);
    // When inspecting the initial loaded inverse collections
    // Then only the Book contains the Comment
    expect(book.comments.get).toEqual([comment]);
    expect(author.comments.get).toEqual([]);

    // When run switches the Comment's parent from the Book to the Author
    await run(ctx, async (ctx) => {
      const c = await ctx.em.load(Comment, comment.id);
      c.parent.set(await ctx.em.load(Author, author.id));
      await ctx.em.flush();
    });
    // Then the test EntityManager mirrors the parent and moves the Comment between inverse collections
    expect(comment.parent.get).toBe(author);
    expect(comment.parent.idMaybe).toBe(author.id);
    expect(book.comments.get).toEqual([]);
    expect(author.comments.get).toEqual([comment]);

    // When run clears the Comment's parent without enforcing its required-parent rule
    await run(ctx, async (ctx) => {
      const c = await ctx.em.load(Comment, comment.id);
      // And the parent is deliberately cleared despite Comment's required-parent rule to test nullable SQL columns
      c.setPartial({ parent: null });
      await ctx.em.flush({ skipValidation: true });
    });
    // Then the test EntityManager clears the reference, its ID, and both inverse collections
    expect(comment.parent.get).toBeUndefined();
    expect(comment.parent.idMaybe).toBeUndefined();
    expect(book.comments.get).toEqual([]);
    expect(author.comments.get).toEqual([]);
  });

  it.withCtx("mirrors polymorphic parent changes and clearing prepopulated data", async (ctx) => {
    // Given a SmallPublisher in the test EntityManager
    const small = newSmallPublisher(ctx.em);
    // And a User with a prepopulated favorite publisher
    const user = newUser(ctx.em, { favoritePublisher: small });
    // And a LargePublisher with an Author to satisfy its required spotlightAuthor default
    const large = newLargePublisher(ctx.em, { authors: [{}] });

    // When run changes the User's favorite publisher from the SmallPublisher to the LargePublisher
    await run(ctx, async (ctx) => {
      const u = await ctx.em.load(User, user.id);
      u.favoritePublisher.set(await ctx.em.load(LargePublisher, large.id));
      await ctx.em.flush();
    });
    // Then the test EntityManager's prepopulated reference points to the LargePublisher
    expect(user.favoritePublisher.get).toBe(large);
    expect(user.favoritePublisher.idMaybe).toBe(large.id);

    // When run clears the User's favorite publisher
    await run(ctx, async (ctx) => {
      const u = await ctx.em.load(User, user.id);
      u.favoritePublisher.set(undefined);
      await ctx.em.flush();
    });
    // Then the test EntityManager's reference and its ID are cleared
    expect(user.favoritePublisher.get).toBeUndefined();
    expect(user.favoritePublisher.idMaybe).toBeUndefined();
  });

  it.withCtx("does not loop with classes", async (ctx) => {
    class Foo {
      constructor(private ctx: Context) {}
    }
    await run(ctx, () => {
      return { foo: new Foo(ctx) };
    });
  });

  it.withCtx("mirrors an inserted date back as a date", async (ctx) => {
    // When a `run` inserts a row with a date
    const a1 = await run(ctx, async (ctx) => {
      const a1 = ctx.em.create(Author, { firstName: "a1", graduated: jan1 });
      await ctx.em.flush();
      return a1;
    });
    // Then the test em sees a Date, and not the ISO string we sent to the driver
    expect(a1.graduated).toEqual(jan1);
  });

  it.withCtx("mirrors an updated date back as a date", async (ctx) => {
    // Given an author that graduated jan1
    const a1 = newAuthor(ctx.em, { graduated: jan1 });

    // When a `run` moves it to jan2
    await run(ctx, async (ctx) => {
      const a = await ctx.em.load(Author, a1.idTagged);
      a.graduated = jan2;
      await ctx.em.flush();
    });

    // Then the test em sees a Date, and not the ISO string we sent to the driver
    expect(a1.graduated).toEqual(jan2);
  });

  it.withCtx("mirrors inserted lazy values for synchronous assertions", async (ctx) => {
    // Given a test EntityManager with no ParentGroups
    // When run creates a ParentGroup with lazy data
    const pg = await run(ctx, async (ctx) => {
      const pg = ctx.em.create(ParentGroup, { name: "pg1", bulkData: { key: "value" }, requiredData: {} });
      await ctx.em.flush();
      return pg;
    });
    // Then the mirrored lazy data can be synchronously asserted against
    expect(pg).toMatchEntity({ bulkData: { key: "value" }, requiredData: {} });
    expect(pg.isDirtyEntity).toBe(false);
    expect(pg.transientFields.observedBulkData).toEqual([]);
  });

  it.withCtx("mirrors an inserted undefined lazy value as loaded", async (ctx) => {
    // Given a test EntityManager with no ParentGroups
    // When run creates a ParentGroup without optional lazy data
    const pg = await run(ctx, async (ctx) => {
      const pg = ctx.em.create(ParentGroup, { name: "pg1", requiredData: {} });
      await ctx.em.flush();
      return pg;
    });
    // Then the mirrored optional lazy field is loaded with undefined
    expect(pg.bulkData.isLoaded).toBe(true);
    expect(pg).toMatchEntity({ bulkData: undefined });
  });

  it.withCtx("mirrors an updated lazy value into the test entity", async (ctx) => {
    // Given a ParentGroup in the test EM with unloaded lazy data
    await insertParentGroup({ name: "pg1", bulk_data: { key: "before" } });
    const pg = await ctx.em.load(ParentGroup, "parentGroup:1");
    // When run replaces the lazy data without first loading it
    await run(ctx, async (ctx) => {
      const pg = await ctx.em.load(ParentGroup, "parentGroup:1");
      pg.bulkData.set({ key: "after" });
      await ctx.em.flush();
    });
    // Then the synced entity exposes the new value without becoming dirty or running its rule
    expect(pg).toMatchEntity({ bulkData: { key: "after" } });
    expect(pg.isDirtyEntity).toBe(false);
    expect(pg.transientFields.observedBulkData).toEqual([]);
  });

  it.withCtx("mirrors clearing a lazy value as loaded undefined", async (ctx) => {
    // Given a ParentGroup in the test EM with loaded lazy data
    await insertParentGroup({ name: "pg1", bulk_data: { key: "before" } });
    const pg = await ctx.em.load(ParentGroup, "parentGroup:1", "bulkData");
    // When run clears the lazy data without first loading it
    await run(ctx, async (ctx) => {
      const pg = await ctx.em.load(ParentGroup, "parentGroup:1");
      pg.bulkData.set(undefined);
      await ctx.em.flush();
    });
    // Then the synced lazy field remains loaded with the cleared value after run completes
    expect(pg.bulkData.isLoaded).toBe(true);
    expect(pg.bulkData.get).toBeUndefined();
    expect(pg.isDirtyEntity).toBe(false);
  });

  it.withCtx("does not preload an untouched lazy field when another field changes", async (ctx) => {
    // Given a ParentGroup in the test EM whose lazy data has never been loaded
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const pg = await ctx.em.load(ParentGroup, "parentGroup:1");
    // When run changes only the ParentGroup's name
    await run(ctx, async (ctx) => {
      const pg = await ctx.em.load(ParentGroup, "parentGroup:1");
      pg.name = "renamed";
      await ctx.em.flush();
    });
    // Then the name is mirrored while the untouched lazy field intentionally stays unloaded
    expect(pg.name).toBe("renamed");
    expect(pg.bulkData.isLoaded).toBe(false);
  });

  it.withCtx("preserves an untouched loaded lazy field", async (ctx) => {
    // Given a ParentGroup in the test EM with loaded lazy data
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const pg = await ctx.em.load(ParentGroup, "parentGroup:1", "bulkData");
    // When run changes only the ParentGroup's name
    await run(ctx, async (ctx) => {
      const pg = await ctx.em.load(ParentGroup, "parentGroup:1");
      pg.name = "renamed";
      await ctx.em.flush();
    });
    // Then the test entity's lazy value remains synchronously readable
    expect(pg.bulkData.get).toEqual({ key: "value" });
  });

  it.withCtx("re-sorts cached books when run changes a book's order", async (ctx) => {
    // Given an author's books ordered b1 before b2
    const author = newAuthor(ctx.em);
    // And two persisted books whose sorted collection is cached in the test EM
    const b1 = newBook(ctx.em, { author, order: 1 });
    const b2 = newBook(ctx.em, { author, order: 2 });
    await ctx.em.flush();
    void author.books.get;
    // When run moves b2 ahead of b1 without changing its author
    await run(ctx, async (ctx) => {
      const book = await ctx.em.load(Book, b2.id);
      book.order = 0;
      await ctx.em.flush();
    });
    // Then the test EM's cached collection reflects the new order
    expect(author.books.get).toMatchEntity([b2, b1]);
  });

  it.withCtx("re-sorts cached books including soft-deleted books when run changes an order", async (ctx) => {
    // Given an author's books ordered b1 before soft-deleted b2
    const author = newAuthor(ctx.em);
    // And both persisted books are cached in the test EM's with-deleted collection
    const b1 = newBook(ctx.em, { author, order: 1 });
    const b2 = newBook(ctx.em, { author, order: 2, deletedAt: jan1 });
    await ctx.em.flush();
    void author.books.getWithDeleted;
    // When run moves b1 after b2 without changing collection membership
    await run(ctx, async (ctx) => {
      const book = await ctx.em.load(Book, b1.id);
      book.order = 3;
      await ctx.em.flush();
    });
    // Then the test EM's with-deleted cache reflects the new order
    expect(author.books.getWithDeleted).toMatchEntity([b2, b1]);
  });

  it.withCtx("invalidates cached reactive values when run changes a read-only dependency", async (ctx) => {
    // Given a publisher whose cached advance snapshot observes status without reacting to it
    const publisher = newSmallPublisher(ctx.em, { name: "p1" });
    // And a persisted pending advance included in the cached snapshot
    const advance = newBookAdvance(ctx.em, { publisher, status: AdvanceStatus.Pending });
    await ctx.em.flush();
    void publisher.bookAdvanceTitlesSnapshot.get;
    // When run signs the advance without recalculating the publisher's persisted snapshot
    await run(ctx, async (ctx) => {
      const ba = await ctx.em.load(BookAdvance, advance.id);
      ba.status = AdvanceStatus.Signed;
      await ctx.em.flush();
    });
    // Then the test EM calculates a fresh snapshot from the mirrored status
    expect(publisher.bookAdvanceTitlesSnapshot.get).toBe("p1,SIGNED");
  });

  it.withCtx("preserves unrelated cached reactive values when run changes a book's order", async (ctx) => {
    // Given an author with a cached book count
    const author = newAuthor(ctx.em);
    // And a persisted book whose order does not affect the count
    const book = newBook(ctx.em, { author, order: 1 });
    await ctx.em.flush();
    void author.numberOfBooks.get;
    const calculations = author.transientFields.numberOfBooksCalcInvoked;
    // When run changes only the book's order
    await run(ctx, async (ctx) => {
      const b = await ctx.em.load(Book, book.id);
      b.order = 2;
      await ctx.em.flush();
    });
    void author.numberOfBooks.get;
    // Then the unrelated cached count is reused
    expect(author.transientFields.numberOfBooksCalcInvoked).toBe(calculations);
  });

  it.withCtx("does not dirty test entities when run mirrors a scalar change", async (ctx) => {
    // Given a persisted book in the test EM
    const book = newBook(ctx.em, { order: 1 });
    await ctx.em.flush();
    // When run changes the book's order
    await run(ctx, async (ctx) => {
      const b = await ctx.em.load(Book, book.id);
      b.order = 2;
      await ctx.em.flush();
    });
    // Then flushing the test EM has no writes to repeat
    expect(await ctx.em.flush()).toEqual([]);
  });

  it.withCtx("does not enqueue test-entity reactions when run mirrors a scalar change", async (ctx) => {
    // Given a persisted author whose ssn reaction has already run in the test EM
    const author = newAuthor(ctx.em, { ssn: "before" });
    await ctx.em.flush();
    const reactions = author.transientFields.reactions.afterMetadata;
    // When run changes the author's ssn and the test EM is subsequently flushed
    await run(ctx, async (ctx) => {
      const a = await ctx.em.load(Author, author.id);
      a.ssn = "after";
      await ctx.em.flush();
    });
    await ctx.em.flush();
    // Then the business reaction is not repeated in the test EM
    expect(author.transientFields.reactions.afterMetadata).toBe(reactions);
  });

  it.withCtx("preserves cached books when run assigns an unchanged order", async (ctx) => {
    // Given a persisted book in its author's cached collection
    const book = newBook(ctx.em, { order: 1 });
    await ctx.em.flush();
    const author = book.author.get;
    const books = author.books.get;
    // When run assigns the book its existing order
    await run(ctx, async (ctx) => {
      const b = await ctx.em.load(Book, book.id);
      b.order = 1;
      await ctx.em.flush();
    });
    // Then the test EM reuses the same filtered and sorted array
    expect(author.books.get === books).toBe(true);
  });
});
