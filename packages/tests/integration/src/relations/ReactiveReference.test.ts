import { Author, Book, BookReview, newAuthor, newPublisher, newSmallPublisher } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisher, select, update } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { getEmInternalApi } from "joist-core";
import { ReactionLogger, setReactionLogging } from "joist-orm";
import { stripAnsi } from "joist-utils";

let reactionOutput: string[] = [];

describe("ReactiveReference", () => {
  it("can be accessed if implicitly loaded", async () => {
    const em = newEntityManager();
    // Given a new author, with at least 1 book
    const a = newAuthor(em, { books: [{}] });
    const [b1] = a.books.get;
    // And we've not explicitly asked for `favoriteBook` to be loaded
    // Then we can access it anyway, because it realizes the load hint is in-memory
    expect(a.favoriteBook.get).toMatchEntity(b1);
  });

  it("reports the initial value as changed", async () => {
    const em = newEntityManager();
    // Given a new author, with at least 1 book
    const a = newAuthor(em, { books: [{}] });
    // When the field hasn't been accessed yet, it's reported as not changed
    expect(a.changes.favoriteBook.hasChanged).toBe(false);
    expect(a.changes.favoriteBook.hasUpdated).toBe(false);
    // But as soon as we access it
    a.favoriteBook.get;
    // Then the field is considered changed
    expect(a.changes.favoriteBook.hasChanged).toBe(true);
    expect(a.changes.favoriteBook.hasUpdated).toBe(false);
  });

  it("reports the cached value as unchanged", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", "favoriteBook");
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(a.changes.favoriteBook.hasChanged).toBe(false);
    expect(a.changes.favoriteBook.hasUpdated).toBe(false);
  });

  it("load does not populates if unnecessary for calculating on a new entity", async () => {
    const em = newEntityManager();
    // Given a new author
    const a = em.create(Author, { firstName: "a1" });
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    // When we load the favoriteBook
    const result = await a.favoriteBook.load();
    expect(result).toBeUndefined();
    expect(queries.length).toEqual(0);
    expect(a.favoriteBook.isLoaded).toBe(true);
    // Then b/c its load hint was already loaded (it's a new entity), there is no need to call populate
    expect(spy).not.toHaveBeenCalled();
  });

  it("load does not populate if already calculated", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    const result = await a.favoriteBook.load();
    expect(result).toBeDefined();
    expect(queries.length).toEqual(1);
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("load automatically populates if the already loaded graph is stale", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBookReview({ book_id: 2, rating: 2 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    // Given we have an existing author
    const a1 = await em.load(Author, "a:1", "favoriteBook");
    // And we've already loaded its favoriteBook
    expect(a1.favoriteBook.isLoaded).toBe(true);
    // ...call this multiple times and watch it not tick...
    expect(a1.favoriteBook.get!.title).toBe("b1");
    // When we mutate the graph by moving b2 (which has reviews unloaded) into a1
    const b2 = await em.load(Book, "b:2");
    b2.author.set(a1);
    // And we access a1.favoriteBook again we see the stale value
    expect(a1.favoriteBook.get!.title).toBe("b1");
    // But if we load it again
    const spy = jest.spyOn(em, "populate");
    await a1.favoriteBook.load();
    expect(spy).toHaveBeenCalledWith(a1, { hint: { books: { reviews: {} } } });
    // Then we see the correct value
    expect(a1.favoriteBook.get!.title).toBe("b2");
  });

  it("load recalculates already-cached references on em.delete", async () => {
    // Given the favoriteBook is initially b1 with rating=2
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 2 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBookReview({ book_id: 2, rating: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const [a1, br1] = await Promise.all([em.load(Author, "a:1"), em.load(BookReview, "br:1")]);
    // And we've already calculated favoriteBook so RR has it loaded/cached
    await a1.favoriteBook.load({ forceReload: true });
    expect(a1.favoriteBook.idTaggedMaybe).toEqual("b:1");
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(1);
    // When we delete br2
    em.delete(br1);
    // Then the RM knows `favoriteBook` is dirty
    expect(getEmInternalApi(em).rm.isMaybePendingRecalc(a1, "favoriteBook")).toBe(true);
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(1);
    // And calling `.get` recalculates the value
    expect((a1.favoriteBook as any).get?.id).toEqual("b:2");
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(2);
    // And when we explicitly load
    const favoriteBook = await a1.favoriteBook.load();
    // Then the value is changed
    expect(favoriteBook?.idTaggedMaybe).toEqual("b:2");
    expect(a1.favoriteBook.idTaggedMaybe).toEqual("b:2");
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(2);
  });

  it("load recalculates already-cached references on setField", async () => {
    // Given the favoriteBook is initially b1 with rating=2
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 2 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBookReview({ book_id: 2, rating: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const [a1, br2] = await Promise.all([em.load(Author, "a:1"), em.load(BookReview, "br:2")]);
    // And we've already calculated favoriteBook so RR has it loaded/cached
    await a1.favoriteBook.load({ forceReload: true });
    expect(a1.favoriteBook.idTaggedMaybe).toEqual("b:1");
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(1);
    // When we change b2's only review rating
    br2.rating = 3;
    // Then the RM does not know `favoriteBook` is dirty
    expect(getEmInternalApi(em).rm.isMaybePendingRecalc(a1, "favoriteBook")).toBe(true);
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(1);
    // And calling `.get` returns the latest value
    expect((a1.favoriteBook as any).get?.id).toEqual("b:2");
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(2);
    // And when we explicitly load
    const favoriteBook = await a1.favoriteBook.load();
    // Then the value is changed
    expect(favoriteBook?.idTaggedMaybe).toEqual("b:2");
    expect(a1.favoriteBook.idTaggedMaybe).toEqual("b:2");
    expect(a1.transientFields.favoriteBookCalcInvoked).toEqual(2);
  });

  it("load does not issue a query if empty", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const spy = jest.spyOn(em, "populate");
    resetQueryCount();
    const result = await a.favoriteBook.load();
    expect(result).toBeUndefined();
    expect(queries).toEqual([]);
    expect(a.favoriteBook.isLoaded).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("doesn't lose loaded-ness after mutation", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    // Given a new author, with at least 1 book
    const a = await em.load(Author, "a:1", "favoriteBook");
    expect(a.favoriteBook.isLoaded).toBe(true);
    a.lastName = "l1";
    expect(a.favoriteBook.isLoaded).toBe(true);
  });

  it("em.delete with o2o reference does not fail", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    // Given we delete a book
    const b = await em.load(Book, "b:1");
    em.delete(b);
    // Then the `Book.favoriteAuthor` o2o does not blow up by setting `Author.favoriteBook` to null
    await em.flush();
  });

  it("works on CTI base types", async () => {
    const em = newEntityManager();
    // Given a LargePublisher (...that uses the Publisher.favoriteBook impl)
    const p = newPublisher(em, {
      authors: [
        // Given one author with 1 book
        { books: [{}] },
        // And another author with 2 books
        { books: [{}, {}] },
      ],
    });
    await em.flush();
    // Then the base favoriteAuthor impl picked the one with 2 books
    expect(p.favoriteAuthor.get).toMatchEntity({ firstName: "a2" });
  });

  it("can be overriden by CTI subtypes", async () => {
    const em = newEntityManager();
    const sp = newSmallPublisher(em, {
      authors: [
        // Given one author with 1 book
        { books: [{}] },
        // And another author with 2 books
        { books: [{}, {}] },
      ],
    });
    await em.flush();
    // Then the subtype favoriteAuthor impl picked the one with 1 book
    expect(sp.favoriteAuthor.get).toMatchEntity({ firstName: "a1" });
  });

  it("drives recalc of downstream ReactiveFields", async () => {
    // Given two books, and the 1st is currently the favorite
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    await insertBookReview({ book_id: 1, rating: 2 });
    await insertBookReview({ book_id: 2, rating: 1 });
    // When we make the 2nd book to have a higher rating
    const em = newEntityManager();
    const br2 = await em.load(BookReview, "br:2");
    br2.rating = 3;
    await em.flush();
    // Then we recalculated the "titles_of_favorite_books" as well
    const rows = await select("publishers");
    expect(rows).toMatchObject([{ id: 1, titles_of_favorite_books: "b2" }]);
  });

  it("drives recalc of downstream ReactiveFields through o2o", async () => {
    // Given two books, and the 1st is currently the favorite
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    // When we change the title of the book
    const em = newEntityManager();
    const b1 = await em.load(Book, "b:1");
    b1.title = "b22";
    await em.flush();
    // Then we recalculated the "titles_of_favorite_books" as well
    const rows = await select("publishers");
    expect(rows).toMatchObject([{ id: 1, titles_of_favorite_books: "b22" }]);
    expect(reactionOutput).toMatchInlineSnapshot(`
     [
       "b:1.title changed, queuing b:1.author.search↩",
       "b:1.title changed, queuing b:1.search↩",
       "b:1.title changed, queuing b:1.favoriteAuthor.publisher.titlesOfFavoriteBooks↩",
       "b:1.title changed, queuing b:1.favoriteAuthor.publisher@LargePublisher.titlesOfFavoriteBooks↩",
       "b:1.title changed, queuing b:1.favoriteAuthor.publisher@SmallPublisher.titlesOfFavoriteBooks↩",
       "Recalculating reactive fields values... (em.entities=1)↩",
       "  Walked 1 Book.(self) paths, found 1 Book.search to recalc↩",
       "    [ b:1 ] -> [ b:1 ]↩",
       "  Walked 1 Book.author paths, found 1 Author.search to recalc↩",
       "    [ b:1 ] -> [ a:1 ]↩",
       "  Walked 1 Book.favoriteAuthor.publisher paths, found 1 Publisher.titlesOfFavoriteBooks to recalc↩",
       "    [ b:1 ] -> [ p:1 ]↩",
       "  Walked 1 Book.favoriteAuthor.publisher@LargePublisher paths, found 0 LargePublisher.titlesOfFavoriteBooks to recalc↩",
       "  Walked 1 Book.favoriteAuthor.publisher@SmallPublisher paths, found 1 SmallPublisher.titlesOfFavoriteBooks to recalc↩",
       "    [ b:1 ] -> [ p:1 ]↩",
       "  Loading 3 actions... (em.entities=3)↩",
       "    Book.search -> [ b:1 ]↩",
       "    Author.search -> [ a:1 ]↩",
       "    SmallPublisher.titlesOfFavoriteBooks -> [ p:1 ]↩",
       "a:1.search changed, queuing a:1.rf↩",
       "    took 0 millis (em.entities=3)↩",
       "  Walked 1 Author.(self) paths, found 1 Author.rf to recalc↩",
       "    [ a:1 ] -> [ a:1 ]↩",
       "  Loading 1 actions... (em.entities=3)↩",
       "    Author.rf -> [ a:1 ]↩",
       "    took 0 millis (em.entities=3)↩",
       "Validating from 3 changed entities... (em.entities=3)↩",
        "  Walked 1 Book.(self) paths, found 1 Book.addRule(Book.ts:133) to validate↩",
       "    [ b:1 ] -> [ b:1 ]↩",
        "  Walked 1 Book.author paths, found 1 Author.addRule(Author.ts:475) to validate↩",
       "    [ b:1 ] -> [ a:1 ]↩",
        "  Walked 1 Book.author.books paths, found 1 Book.addRule(Book.ts:85) to validate↩",
       "    [ b:1 ] -> [ b:1 ]↩",
       "  Walked 1 Book.author.publisher paths, found 1 Publisher.addRule(Publisher.ts:207) to validate↩",
       "    [ b:1 ] -> [ p:1 ]↩",
     ]
    `);
  });
});

beforeEach(() => {
  reactionOutput = [];
  setReactionLogging(new StubReactionLogger());
});

class StubReactionLogger extends ReactionLogger {
  constructor() {
    super((line: string) => {
      reactionOutput.push(stripAnsi(line).replace("\n", "↩"));
    });
  }
  // Ensure deterministic output
  now = () => 0;
}

afterAll(() => {
  setReactionLogging(false);
});
