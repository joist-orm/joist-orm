import { Author, Book, BookReview, Color, newAuthor, newBook, newBookReview, newPublisher } from "@src/entities";
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
    expect(getMetadata(Author).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: sm(/Author.ts:\d+/), fields: ["firstName"], path: [], fn: expect.any(Function) },
      // Author's "cannot have 13 books" rules
      { name: sm(/Author.ts:\d+/), fields: [], path: [], fn: expect.any(Function) },
      // Author's noop mentor rule
      { name: sm(/Author.ts:\d+/), fields: ["mentor"], path: [], fn: expect.any(Function) },
      // Author's graduated rule that runs on hook changes
      { name: sm(/Author.ts:\d+/), fields: ["graduated"], path: [], fn: expect.any(Function) },
      // Author's immutable age rule (w/o age listed b/c it is immutable, but still needs to fire on create)
      { name: sm(/Author.ts:\d+/), fields: [], path: [], fn: expect.any(Function) },
      // Book's noop author.firstName rule, only depends on firstName
      { name: sm(/Book.ts:\d+/), fields: ["firstName"], path: ["books"], fn: expect.any(Function) },
      // Book's "too many colors" rule, only depends on favoriteColors, not firstName:ro
      { name: sm(/Book.ts:\d+/), fields: ["favoriteColors"], path: ["books"], fn: expect.any(Function) },
      // Publisher's "cannot have 13 authors" rule
      { name: sm(/Publisher.ts:\d+/), fields: ["publisher"], path: ["publisher"], fn: expect.any(Function) },
      // Publisher's numberOfBooks2 rule
      { name: sm(/Publisher.ts:\d+/), fields: ["publisher"], path: ["publisher"], fn: expect.any(Function) },
    ]);

    expect(getMetadata(Book).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: sm(/Author.ts:\d+/), fields: ["author", "title"], path: ["author"], fn: expect.any(Function) },
      // Author's "cannot have 13 books" rule
      { name: sm(/Author.ts:\d+/), fields: ["author"], path: ["author"], fn: expect.any(Function) },
      // Book's noop rule on author.firstName, if author changes
      { name: sm(/Book.ts:\d+/), fields: ["author"], path: [], fn: expect.any(Function) },
      // Book's "too many colors" rule, if author changes
      { name: sm(/Book.ts:\d+/), fields: ["author"], path: [], fn: expect.any(Function) },
      // Book's "reviewsRuleInvoked", when BookReview.book is immutable field
      { name: sm(/Book.ts:\d+/), fields: [], path: [], fn: expect.any(Function) },
      // Book's "numberOfBooks2" rule (this book + other books)
      { name: sm(/Book.ts:\d+/), fields: ["author"], path: [], fn: expect.any(Function) },
      { name: sm(/Book.ts:\d+/), fields: ["author"], path: ["author", "books"], fn: expect.any(Function) },
      // Publisher's "numberOfBooks2" rule
      { name: sm(/Publisher.ts:\d+/), fields: ["author"], path: ["author", "publisher"], fn: expect.any(Function) },
    ]);

    expect(getMetadata(BookReview).config.__data.reactiveRules).toEqual([
      // Book's "reviewsRuleInvoked", when BookReview.book is immutable field
      { name: sm(/Book.ts:\d+/), fields: [], path: ["book"], fn: expect.any(Function) },
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

  it.withCtx("creates the right reactive derived values", async () => {
    expect(getMetadata(Book).config.__data.reactiveDerivedValues).toEqual([
      { name: "numberOfBooks", fields: ["author"], path: ["author"] },
      { name: "bookComments", fields: ["author"], path: ["author"] },
      { name: "isPublic", fields: ["author"], path: ["reviews"] },
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
      const p = newPublisher(em, {
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
  });
});
