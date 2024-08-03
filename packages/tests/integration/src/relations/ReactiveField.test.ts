import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertComment,
  insertTag,
  select,
  update,
} from "@src/entities/inserts";
import { knex, newEntityManager } from "@src/testEm";
import { noValue } from "joist-orm";
import { Author, Book, BookRange, BookReview, Tag, newAuthor, newBook, newBookReview, newComment } from "../entities";

describe("ReactiveField", () => {
  it("can repopulate a changed tree", async () => {
    // Given a tree of Author (that can have public reviews)/Book/Review
    await insertAuthor({ first_name: "a1", age: 21, graduated: new Date() });
    await insertAuthor({ first_name: "a2", age: 21, graduated: new Date() });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBookReview({ rating: 1, book_id: 1 });
    const em = newEntityManager();
    // And we can load the numberOfPublicReviews tree
    const a = await em.load(Author, "a:1");
    expect(await a.numberOfPublicReviews.load()).toBe(1);
    // When we move Book b2 into a1 (instead of creating a new one, to ensure its review collection is not loaded)
    const b2 = await em.load(Book, "b:2");
    b2.author.set(a);
    // Then calc it again, it will blow up (b/c the new b2 hasn't had its reviews loaded)
    expect(() => a.numberOfPublicReviews.get).toThrow("get was called when not loaded");
    // But if we try to .load it again, it will know it needs to reload its subgraph
    expect(await a.numberOfPublicReviews.load()).toBe(1);
    // And also if we call force the load
    expect(await a.numberOfPublicReviews.load({ forceReload: true })).toBe(1);
  });

  it("calcs reactive fields on create", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    new Book(em, { title: "b1", author: a1 });
    await em.flush();
    expect(a1.numberOfBooks.get).toEqual(1);
    const rows = await select("authors");
    expect(rows[0].number_of_books).toEqual(1);
  });

  it("calcs reactive enums on create", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    new Book(em, { title: "b1", author: a1 });
    await em.flush();
    expect(a1.rangeOfBooks.get).toEqual(BookRange.Few);
    const rows = await select("authors");
    expect(rows[0].range_of_books).toEqual(1);
  });

  it("can access reactive fields immediately without loading", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    expect(a1.numberOfBooks.get).toEqual(0);
  });

  it("recalcs when o2m relation updated", async () => {
    const em = newEntityManager();
    // Given an author with initially no books
    const a1 = new Author(em, { firstName: "a1" });
    await em.flush();
    expect(a1.numberOfBooks.get).toEqual(0);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(2);
    // When we add a book
    new Book(em, { title: "b1", author: a1 });
    // Then the author ReactiveField is recaled
    await em.flush();
    expect(a1.numberOfBooks.get).toEqual(1);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(4);
    const rows = await select("authors");
    expect(rows[0].number_of_books).toEqual(1);
  });

  it("can em.recalc to update a stale value", async () => {
    const em = newEntityManager();
    // Given an author with a book that has a review that should be public
    const a1 = new Author(em, { firstName: "a1", age: 22, graduated: new Date() });
    const b1 = newBook(em, { author: a1 });
    const br = newBookReview(em, { rating: 1, book: b1 });
    const comment = newComment(em, { text: "", parent: br });
    await em.flush();
    expect(a1.numberOfPublicReviews2.get).toEqual(1);
    expect(br.isTest.get).toEqual(false);

    // And the comment is set to be Test, but not calculated
    await knex.raw(`UPDATE comments SET text = 'Test' WHERE id = ${comment.idUntagged}`);

    // When the objects are loaded into a new Entity Manager
    const em2 = newEntityManager();
    const a2 = await em2.load(Author, a1.id);
    const br2 = await em2.load(BookReview, br.id);

    // Then nothing has been touched
    expect(a2.numberOfPublicReviews2.get).toEqual(1);
    expect(br2.isTest.get).toEqual(false);

    // And when the book review object is touched and flushed to have its fields recalculated
    await em2.recalc(br2);

    // Then the value is updated on both the book review AND its dependent field on the author
    expect(br2.isTest.get).toEqual(true);
    expect(a2.numberOfPublicReviews2.get).toEqual(0);

    // And when we flush, both entities were committed
    const entities = await em2.flush();
    expect(entities).toMatchEntity([a2, br2]);
    // Then the author's hooks ran as expected
    expect(a2.transientFields.beforeFlushRan).toBe(true);
  });

  it("does not transitively load reactive fields used by other reactive fields", async () => {
    {
      const em = newEntityManager();
      // Given an author with a RF, numberOfPublicReviews2, that uses a RF on BookReview, isPublic
      const a1 = new Author(em, { firstName: "a1", age: 22, graduated: new Date() });
      const b1 = newBook(em, { author: a1 });
      const br = newBookReview(em, { rating: 1, book: b1 });
      newComment(em, { text: "", parent: br });
      await em.flush();
    }
    // When we want to recalc numberOfPublicReviews2
    const em2 = newEntityManager();
    const a1 = await em2.load(Author, "a:1");
    const b1 = await em2.load(Book, "b:1");
    // And we make a new BookReview that doesn't have isPublic calculated yet
    const br2 = em2.create(BookReview, { book: b1, rating: 2 });
    // Then the numberOfPublicReviews2.load will ensure br2.isPublic is loaded first
    expect(await a1.numberOfPublicReviews2.load()).toBe(2);
    // And we calc'd the br2.isPublic b/c it's new
    expect(br2.transientFields.numberOfIsPublicCalcs).toBe(1);
    // But we did not recalc br1.isPublic because it's already set
    const br1 = await em2.load(BookReview, "br:1");
    expect(br1.transientFields.numberOfIsPublicCalcs).toBe(0);
  });

  it("can save when reactive fields values don't change", async () => {
    const em = newEntityManager();
    // Given an author with a book
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { author: a1, title: "b1" });
    await em.flush();
    expect(a1.numberOfBooks.get).toEqual(1);
    // And we calc'd it once during flush, and again in the ^ `.get`
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(2);
    // When we change the book
    b1.title = "b12";
    await em.flush();
    // Then the author derived value didn't change
    expect(a1.numberOfBooks.get).toEqual(1);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(3);
  });

  it("can recalc RFs with em.recalc", async () => {
    const em = newEntityManager();
    // Given an author with a book
    const a1 = newAuthor(em, { firstName: "a1" });
    await em.flush();
    expect(a1.numberOfBooks.get).toEqual(0);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(2);
    // When we touch the author
    await em.recalc(a1);
    // Then the derived value was recalculated
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(3);
    // Even though it didn't technically change
    expect(a1.numberOfBooks.get).toEqual(0);
  });

  it("can recalc RRs with em.recalc", async () => {
    // Given a stale ReactiveReference
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBookReview({ book_id: 2, rating: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });
    // And initially we see the stale value
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1", "favoriteBook");
    expect(a1.favoriteBook.get!.title).toBe("b1");
    expect(a1.transientFields.favoriteBookCalcInvoked).toBe(0);
    // When we recalc the author
    await em.recalc(a1);
    // Then the derived value was recalculated
    expect(a1.transientFields.favoriteBookCalcInvoked).toBe(1);
    // And it was updated
    expect(a1.favoriteBook.get!.title).toBe("b2");
  });

  it("can recalc getters with em.recalc", async () => {
    // Given an author
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
    // And their initials have drifted out of sync
    await update("authors", { id: 1, initials: "bad" });
    // When we call recalc
    const em2 = newEntityManager();
    const a2 = await em2.load(Author, "a:1");
    await em2.recalc(a2);
    await em2.flush();
    // Then it's been updated
    expect(await select("authors")).toMatchObject([{ initials: "a" }]);
  });

  it("might be stale until being loaded by calling .load()", async () => {
    // Given an author with a book
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    // When we load the author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // We can access the numberOfBooks without it being calculated
    expect(a1.numberOfBooks.get).toEqual(1);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(0);
    // And when we create a new book
    const b2 = em.create(Book, { title: "b2", author: a1 });
    // Then numberOfBooks is initially still stale
    expect(a1.numberOfBooks.get).toEqual(1);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(0);
    // But if we load it via a load call, then we'll get the live value
    expect(await a1.numberOfBooks.load()).toEqual(2);
    // we'll have invoked the calc
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(1);
    // and a1 will be dirty with a changed numberOfBooks
    expect(a1.isDirtyEntity).toBe(true);
    expect(a1.changes.numberOfBooks.hasChanged).toBe(true);
  });

  it("is not loaded by em.populate() calls", async () => {
    // Given an author with a book
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    // When we load the author
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // We can access the numberOfBooks without it being calculated
    expect(a1.numberOfBooks.get).toEqual(1);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(0);
    // And if we load it via a populate hint (i.e. some other RF that is including
    // it as a dependency, without really wanting it to be fully loaded & recalced).
    await em.populate(a1, "numberOfBooks");
    // Then we still get the existing/correct value and did not recalc it
    expect(a1.numberOfBooks.get).toEqual(1);
    expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(0);
  });

  describe("dirty tracking", () => {
    it("crawls both old & new values while reversing m2os", async () => {
      const em = newEntityManager();
      // Given two authors
      const a1 = new Author(em, { firstName: "a1" });
      const a2 = new Author(em, { firstName: "a2" });
      //  And a book that is originally associated with a1
      const b1 = new Book(em, { title: "b1", author: a1 });
      await em.flush();
      expect(a1.numberOfBooks.get).toEqual(1);
      expect(a2.numberOfBooks.get).toEqual(0);
      // When we move the book to a2
      b1.author.set(a2);
      await em.flush();
      // Then both derived values got updated
      expect(a1.numberOfBooks.get).toEqual(0);
      expect(a2.numberOfBooks.get).toEqual(1);
    });

    it("crawls unloaded old values while reversing m2os", async () => {
      const em = newEntityManager();
      // Given a book & author already in the database
      await insertAuthor({ first_name: "a1", number_of_books: 1 });
      await insertBook({ title: "b1", author_id: 1 });
      // When we make a new author for b1 (and a1 is not even in the UnitOfWork)
      const a2 = new Author(em, { firstName: "a2" });
      const b1 = await em.load(Book, "1");
      b1.author.set(a2);
      await em.flush();
      // Then both authors derived values got updated
      const rows = await select("authors");
      expect(rows[0]).toMatchObject({ id: 1, number_of_books: 0 });
      expect(rows[1]).toMatchObject({ id: 2, number_of_books: 1 });
    });

    it("crawls down through o2ms", async () => {
      // Given an author is 21 but not graduated (so BookReview won't be published)
      await insertAuthor({ first_name: "a1", age: 21 });
      await insertBook({ title: "b1", author_id: 1 });
      // And a new book review is created
      const em = newEntityManager();
      const b1 = await em.load(Book, "1");
      em.create(BookReview, { rating: 1, book: b1 });
      await em.flush();
      // Then the review is initially private
      const rows = await select("book_reviews");
      expect(rows[0].is_public).toBe(false);

      // And when the author graduates
      const em2 = newEntityManager();
      const a1 = await em2.load(Author, "1");
      a1.graduated = new Date();
      await em2.flush();
      // Then the review is now public
      const rows2 = await select("book_reviews");
      expect(rows2[0].is_public).toBe(true);
    });
  });

  it("cannot access RFs before flush", async () => {
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    const em = newEntityManager();
    const br1 = newBookReview(em, { book: { author: "a:1" } });
    expect(() => br1.isPublic.get).toThrow("isPublic has not been derived yet");
  });

  it("can react through polys", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertComment({ text: "c1", parent_author_id: 1 });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    await insertAuthorToTag({ author_id: 1, tag_id: 2 });
    const em = newEntityManager();
    const t1 = await em.load(Tag, "t:1");
    t1.name = "t11";
    await em.flush();
    const rows = await select("comments");
    expect(rows[0]).toMatchObject({ parent_tags: "books=0-t11-t2" });
  });

  it("can react through polys on a different poly component", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 1, book_id: 1 });
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertComment({ text: "c1", parent_book_id: 1 });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    await insertBookToTag({ book_id: 1, tag_id: 2 });
    const em = newEntityManager();
    const t1 = await em.load(Tag, "t:1");
    t1.name = "t11";
    await em.flush();
    const rows = await select("comments");
    expect(rows[0]).toMatchObject({ parent_tags: "reviews=1-t11-t2" });
  });

  it("throws validation rules instead of NPEs in lambdas accessing unset required relations", async () => {
    const em = newEntityManager();
    newBook(em, { author: noValue() });
    await expect(em.flush()).rejects.toThrow("Book#1 author is required");
  });

  it("still throws valid NPEs in lambdas", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    b1.transientFields.throwNpeInSearch = true;
    await expect(em.flush()).rejects.toThrow("Cannot read properties of undefined (reading 'willFail')");
  });
});
