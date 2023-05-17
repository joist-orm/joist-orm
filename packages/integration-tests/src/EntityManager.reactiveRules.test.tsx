import {
  Author,
  Book,
  BookReview,
  Color,
  Comment,
  newAuthor,
  newBook,
  newBookReview,
  newPublisher,
  SmallPublisher,
} from "@src/entities";
import { select } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";
import { getMetadata } from "joist-orm";

const sm = expect.stringMatching;

describe("EntityManager.reactiveRules", () => {
  it.withCtx("runs m2o reactive rules", async ({ em }) => {
    // Given a Book with a rule on its m2o author.firstName
    const a = newAuthor(em, { firstName: "a1" });
    const b = newBook(em, { author: a });
    await em.flush();
    // Then we invoke both rules on initial save
    expect(b.firstNameRuleInvoked).toBe(1);
    expect(b.favoriteColorsRuleInvoked).toBe(1);
    // And when the Author.firstName changes
    a.firstName = "a2";
    await em.flush();
    // Then only the firstName validation rule runs again
    expect(b.firstNameRuleInvoked).toBe(2);
    expect(b.favoriteColorsRuleInvoked).toBe(1);
    // And when we change the favorite color
    a.favoriteColors = [Color.Red];
    await em.flush();
    // Then only the favoriteColors rule runs
    expect(b.firstNameRuleInvoked).toBe(2);
    expect(b.firstNameRuleInvoked).toBe(2);
    // And when we change something else
    a.mentor.set(newAuthor(em));
    await em.flush();
    // Then neither rule ran
    expect(b.firstNameRuleInvoked).toBe(2);
    expect(b.firstNameRuleInvoked).toBe(2);
  });

  it.withCtx("only runs explicitly triggered rules when updating", async ({ em }) => {
    // Given a Book
    const b = newBook(em, { title: "b1" });
    await em.flush();
    // Then we invoke both rules on initial save
    expect(b.rulesInvoked).toBe(1);
    expect(b.firstNameRuleInvoked).toBe(1);
    expect(b.favoriteColorsRuleInvoked).toBe(1);
    // And when the title changes
    b.title = "b2";
    await em.flush();
    // Then the field-level rules did not run
    expect(b.firstNameRuleInvoked).toBe(1);
    expect(b.favoriteColorsRuleInvoked).toBe(1);
  });

  it.withCtx("runs all rules on create", async ({ em }) => {
    // Given an author that has no mentor
    const a = newAuthor(em);
    await em.flush();
    // Then we run the mentor rule
    expect(a.mentorRuleInvoked).toBe(1);
    // And when we do set the mentor
    a.mentor.set(newAuthor(em));
    await em.flush();
    // Then it runs again
    expect(a.mentorRuleInvoked).toBe(2);
  });

  it.withCtx("runs rule triggered by a hook", async ({ em }) => {
    // Given an author
    const a = newAuthor(em);
    await em.flush();
    // And the rule runs b/c all rules run on create
    expect(a.graduatedRuleInvoked).toBe(1);
    // When we change something about the author
    a.mentor.set(newAuthor(em));
    // And also tell the hook to change graduated
    a.setGraduatedInFlush = true;
    await em.flush();
    // Then the validation rule (or async derived field) that depends on
    // `Author.graduated` runs again
    expect(a.graduatedRuleInvoked).toBe(2);
  });

  it.withCtx("runs rule on parent of an immutable field", async ({ em }) => {
    // Given a book
    const b = newBook(em);
    await em.flush();
    // And the rule runs on initial create
    expect(b.reviewsRuleInvoked).toBe(1);
    // When we add a new review
    const br = newBookReview(em, { book: b });
    await em.flush();
    // Then the rule runs again
    expect(b.reviewsRuleInvoked).toBe(2);
    // And when we delete the review
    em.delete(br);
    await em.flush();
    // Then the rule runs again
    expect(b.reviewsRuleInvoked).toBe(3);
  });

  it.withCtx("creates the right reactive rules", async () => {
    const cstr = expect.any(Function);
    const fn = expect.any(Function);
    expect(getMetadata(Author).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { cstr, name: sm(/Author.ts:\d+/), fields: ["firstName"], path: [], fn },
      // Author's "cannot have 13 books" rules
      { cstr, name: sm(/Author.ts:\d+/), fields: [], path: [], fn },
      // Author's noop mentor rule
      { cstr, name: sm(/Author.ts:\d+/), fields: ["mentor"], path: [], fn },
      // Author's graduated rule that runs on hook changes
      { cstr, name: sm(/Author.ts:\d+/), fields: ["graduated"], path: [], fn },
      // Author's immutable age rule (w/o age listed b/c it is immutable, but still needs to fire on create)
      { cstr, name: sm(/Author.ts:\d+/), fields: [], path: [], fn },
      // Book's noop author.firstName rule, only depends on firstName
      { cstr, name: sm(/Book.ts:\d+/), fields: ["firstName"], path: ["books"], fn },
      // Book's "too many colors" rule, only depends on favoriteColors, not firstName:ro
      { cstr, name: sm(/Book.ts:\d+/), fields: ["favoriteColors"], path: ["books"], fn },
      // Publisher's "cannot have 13 authors" rule
      { cstr, name: sm(/Publisher.ts:\d+/), fields: ["publisher"], path: ["publisher"], fn },
      // Publisher's numberOfBooks2 "cannot have 13 books" rule
      { cstr, name: sm(/Publisher.ts:\d+/), fields: ["publisher"], path: ["publisher"], fn },
      // Publisher's numberOfBooks "cannot have 15 books" rule
      { cstr, name: sm(/Publisher.ts:\d+/), fields: ["publisher", "numberOfBooks"], path: ["publisher"], fn },
      // SmallPublisher's "cannot have >5 authors" rule
      { cstr, name: sm(/Publisher.ts:\d+/), fields: ["publisher"], path: ["publisher"], fn },
    ]);

    expect(getMetadata(Book).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { cstr, name: sm(/Author.ts:\d+/), fields: ["author", "title"], path: ["author"], fn },
      // Author's "cannot have 13 books" rule
      { cstr, name: sm(/Author.ts:\d+/), fields: ["author"], path: ["author"], fn },
      // Book's noop rule on author.firstName, if author changes
      { cstr, name: sm(/Book.ts:\d+/), fields: ["author"], path: [], fn },
      // Book's "too many colors" rule, if author changes
      { cstr, name: sm(/Book.ts:\d+/), fields: ["author"], path: [], fn },
      // Book's "reviewsRuleInvoked", when BookReview.book is immutable field
      { cstr, name: sm(/Book.ts:\d+/), fields: [], path: [], fn },
      // Book's "numberOfBooks2" rule (this book + other books)
      { cstr, name: sm(/Book.ts:\d+/), fields: ["author"], path: [], fn },
      { cstr, name: sm(/Book.ts:\d+/), fields: ["author", "title"], path: ["author", "books"], fn },
      // Publisher's numberOfBooks2 "cannot have 13 books" rule
      { cstr, name: sm(/Publisher.ts:\d+/), fields: ["author", "title"], path: ["author", "publisher"], fn },
    ]);

    expect(getMetadata(BookReview).config.__data.reactiveRules).toEqual([
      // Book's "reviewsRuleInvoked", when BookReview.book is immutable field
      { cstr, name: sm(/Book.ts:\d+/), fields: [], path: ["book"], fn },
    ]);

    expect(getMetadata(SmallPublisher).config.__data.reactiveRules).toEqual([
      { cstr: SmallPublisher, name: sm(/SmallPublisher.ts:\d+/), fields: [], path: [], fn },
    ]);
  });

  it.withCtx("runs async derived on delete", async ({ em }) => {
    // Given an entity with an async derived field
    const a = newAuthor(em);
    const b = newBook(em, { author: a });
    await em.flush();
    expect(a.numberOfBooks.get).toBe(1);
    // When the associated entity is deleted
    await em.delete(b);
    await em.flush();
    // Then it is properly recalculated
    expect(a.books.get.length).toBe(0);
    expect(a.numberOfBooks.get).toBe(0);
  });

  it.withCtx("updates derived fields that are foreign keys", async ({ em }) => {
    // Given an entity with an async derived field
    const a = newAuthor(em);
    const b = newBook(em, { author: a, reviews: [{ rating: 10 }] });
    await em.flush();

    const favoriteBook = a.favoriteBook.get;
    // For some reason .toMatchEntity(b) fails here
    expect(a.favoriteBook.get).toBe(b);

    // If there is a new favorite book
    const b2 = newBook(em, { author: a, reviews: [{ rating: 20 }] });
    await em.flush();
    // Then the derived field is updated
    expect(a.favoriteBook.get).toBe(b2);

    // If the favorite book is deleted
    em.delete(b2);
    await em.flush();
    // Then the derived field is updated
    expect(a.favoriteBook.get).toBe(b);
  });

  it.withCtx("creates the right reactive derived values", async () => {
    const cstr = expect.any(Function);
    expect(getMetadata(Book).config.__data.reactiveDerivedValues).toEqual([
      { cstr, name: "numberOfBooks", fields: ["author"], path: ["author"] },
      { cstr, name: "bookComments", fields: ["author"], path: ["author"] },
      { cstr, name: "numberOfPublicReviews", fields: ["author"], path: ["author"] },
      { cstr, name: "favoriteBook", fields: ["author"], path: ["author"] },
      { cstr, name: "isPublic", fields: ["author"], path: ["reviews"] },
    ]);
    expect(getMetadata(BookReview).config.__data.reactiveDerivedValues).toEqual([
      { cstr, name: "numberOfPublicReviews", fields: ["isPublic", "rating"], path: ["book", "author"] },
      { cstr, name: "favoriteBook", fields: ["rating"], path: ["book", "author"] },
      { cstr, name: "isPublic", fields: [], path: [] },
    ]);
  });

  it.withCtx("invokes the reactive derived value the expected number of times", async ({ em }) => {
    // Given an author with books that have comments
    const a = newAuthor(em, {
      books: [{ comments: [{ text: "B1C1" }, { text: "B1C2" }] }, { comments: [{ text: "B2C1" }, { text: "B2C2" }] }],
    });
    // When I flush
    await em.flush();
    // Then I expect that the bookComments has been calc'd
    expect(a.bookCommentsCalcInvoked).toEqual(1);
    expect(a.bookComments.fieldValue).toEqual("B1C1, B1C2, B2C1, B2C2");
    // And when a publisher with a comment is created
    const p = newPublisher(em, { authors: [a], comments: [{}, {}] });
    await em.flush();
    // Then bookComments is not recalc'd
    expect(a.bookCommentsCalcInvoked).toEqual(1);
    // And when one of the authors book comments is touched
    const [commentB1C1] = a.books.get[0].comments.get;
    commentB1C1.text = "B1C1 - Updated";
    await em.flush();
    // Then I expect that bookComments was recalc'd
    expect(a.bookCommentsCalcInvoked).toEqual(2);
    expect(a.bookComments.fieldValue).toEqual("B1C1 - Updated, B1C2, B2C1, B2C2");
    // And when I move the comment to be on a publisher instead
    commentB1C1.parent.set(p);
    await em.flush();
    // Then I expect that the bookComments is recalc'd
    expect(a.bookCommentsCalcInvoked).toEqual(3);
    expect(a.bookComments.fieldValue).toEqual("B1C2, B2C1, B2C2");
  });

  describe("async properties", () => {
    it.withCtx("runs rule on new grandchild", async ({ em }) => {
      // Given a publisher that has two authors
      const p = newPublisher(em, {
        authors: [
          // And each author has 6 books
          { books: [{}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}] },
        ],
      });
      await em.flush();
      // When we add a 13th book to the 2nd author
      newBook(em, { author: p.authors.get[1] });
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 13 books");
    });

    it.withCtx("runs rule on added children", async ({ em }) => {
      // Given a publisher that has two authors
      newPublisher(em, {
        authors: [
          // And each author has 6 books
          { books: [{}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}] },
        ],
      });
      await em.flush();
      // When we add a 3rd author with a single book
      newAuthor(em, { books: [{}] });
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 13 books");
    });

    it.withCtx("runs rule on removed children", async ({ em }) => {
      // Given a publisher that has three authors
      const p = newPublisher(em, {
        authors: [
          // And two authors has 6+7 books
          { books: [{}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}, {}] },
          // And the 3rd has just 1 book
          { books: [{}] },
        ],
      });
      await em.flush();
      // When we remove the 3rd author with a single book
      p.authors.get[2].publisher.set(undefined);
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 13 books");
    });

    it.withCtx("runs rule on async property change", async ({ em }) => {
      // Given a publisher that has two authors
      const p = newPublisher(em, {
        authors: [
          // And each author has 7 books (14 total)
          { books: [{}, {}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}, {}] },
        ],
      });
      await em.flush();
      // When we cause a book mutation that changes the Author.numberOfBooks2 async property
      p.authors.get[0].books.get[0].title = "Ignore";
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 13 books");
    });
  });

  describe("persisted async properties", () => {
    it.withCtx("runs rule on new grandchild", async ({ em }) => {
      // Given a publisher that has two authors
      const p = newPublisher(em, {
        authors: [
          // And each author has 7 books
          { books: [{}, {}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}, {}] },
        ],
      });
      await em.flush();
      // When we add a 15th book to the 2nd author
      newBook(em, { author: p.authors.get[1] });
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 15 books");
    });

    it.withCtx("runs rule on added children", async ({ em }) => {
      // Given a publisher that has two authors
      newPublisher(em, {
        authors: [
          // And each author has 7 books
          { books: [{}, {}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}, {}] },
        ],
      });
      await em.flush();
      // When we add a 3rd author with a single book
      newAuthor(em, { books: [{}] });
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 15 books");
    });

    it.withCtx("runs rule on removed children", async ({ em }) => {
      // Given a publisher that has three authors
      const p = newPublisher(em, {
        authors: [
          // And two authors has 7+8 books (15)
          { books: [{}, {}, {}, {}, {}, {}, {}] },
          { books: [{}, {}, {}, {}, {}, {}, {}, {}] },
          // And the 3rd has just 1 book (a 16th book)
          { books: [{}] },
        ],
      });
      await em.flush();
      // When we remove the 3rd author with a single book
      p.authors.get[2].publisher.set(undefined);
      // Then it fails
      await expect(em.flush()).rejects.toThrow("A publisher cannot have 15 books");
    });

    describe("numberOfPublicReviews", () => {
      it.withCtx("calculates on initial author save", async ({ em }) => {
        newAuthor(em);
        await em.flush();
        expect(await select("authors")).toMatchObject([{ id: 1, number_of_public_reviews: 0 }]);
      });

      it.withCtx("calculates on initial author save w/a matching book", async ({ em }) => {
        newAuthor(em, { age: 40, graduated: new Date(), books: [{ reviews: [{ rating: 1 }] }] });
        await em.flush();
        expect(await select("authors")).toMatchObject([{ id: 1, number_of_public_reviews: 1 }]);
      });

      it.withCtx("calculates on new review", async ({ em }) => {
        newAuthor(em, { age: 40, graduated: new Date(), books: [{}] });
        await em.flush();
        // Use a new em to ensure nothing is cached
        const em2 = newEntityManager();
        em2.create(BookReview, { book: "b:1", rating: 1 });
        await em2.flush();
        expect(await select("authors")).toMatchObject([{ id: 1, number_of_public_reviews: 1 }]);
      });

      it.withCtx("calculates on updated review", async ({ em }) => {
        newAuthor(em, { age: 40, graduated: new Date(), books: [{ reviews: [{ rating: 0 }] }] });
        await em.flush();
        // Use a new em to ensure nothing is cached
        const em2 = newEntityManager();
        const br = await em2.load(BookReview, "br:1");
        br.rating = 1;
        await em2.flush();
        expect(await select("authors")).toMatchObject([{ id: 1, number_of_public_reviews: 1 }]);
      });

      it.withCtx("calculates on async property change", async ({ em }) => {
        // Given a public review
        newAuthor(em, { age: 40, graduated: new Date(), books: [{ reviews: [{ rating: 1, comment: {} }] }] });
        await em.flush();
        expect(await select("authors")).toMatchObject([{ id: 1, number_of_public_reviews: 1 }]);
        // Use a new em to ensure nothing is cached
        const em2 = newEntityManager();
        // When we cause the BookReview.isPublic2 async property to change
        const c = await em2.load(Comment, "comment:1");
        c.text = "Ignore";
        await em2.flush();
        // Then numberOfPublicReviews is updated
        expect(await select("authors")).toMatchObject([{ id: 1, number_of_public_reviews: 0 }]);
      });
    });
  });
});
