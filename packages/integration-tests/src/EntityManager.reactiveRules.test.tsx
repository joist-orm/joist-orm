import { Author, Book, BookReview, Color, newAuthor, newBook, newBookReview } from "@src/entities";
import { getMetadata } from "joist-orm";

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

  it.withCtx("creates the right reactive rules", async ({ em }) => {
    expect(getMetadata(Author).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: "Author.ts:115", fields: ["firstName"], path: [], fn: expect.any(Function) },
      // Author's "cannot have 13 books" rules
      { name: "Author.ts:122", fields: [], path: [], fn: expect.any(Function) },
      // Author's noop mentor rule
      { name: "Author.ts:129", fields: ["mentor"], path: [], fn: expect.any(Function) },
      // Author's graduated rule that runs on hook changes
      { name: "Author.ts:134", fields: ["graduated"], path: [], fn: expect.any(Function) },
      // Author's immutable age rule (w/o age listed b/c it is immutable, but still needs to fire on create)
      { name: "Author.ts:142", fields: [], path: [], fn: expect.any(Function) },
      // Book's noop author.firstName rule, only depends on firstName
      { name: "Book.ts:15", fields: ["firstName"], path: ["books"], fn: expect.any(Function) },
      // Book's "too many colors" rule, only depends on favoriteColors, not firstName:ro
      { name: "Book.ts:20", fields: ["favoriteColors"], path: ["books"], fn: expect.any(Function) },
      { name: "Publisher.ts:42", fields: ["publisher"], path: ["publisher"], fn: expect.any(Function) },
    ]);

    expect(getMetadata(Book).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: "Author.ts:115", fields: ["author", "title"], path: ["author"], fn: expect.any(Function) },
      // Author's "cannot have 13 books" rule
      { name: "Author.ts:122", fields: ["author"], path: ["author"], fn: expect.any(Function) },
      // Book's noop rule on author.firstName, if author changes
      { name: "Book.ts:15", fields: ["author"], path: [], fn: expect.any(Function) },
      // Book's "too many colors" rule, if author changes
      { name: "Book.ts:20", fields: ["author"], path: [], fn: expect.any(Function) },
      // Book's "reviewsRuleInvoked", when BookReview.book is immutable field
      { name: "Book.ts:28", fields: [], path: [], fn: expect.any(Function) },
    ]);

    expect(getMetadata(BookReview).config.__data.reactiveRules).toEqual([
      // Book's "reviewsRuleInvoked", when BookReview.book is immutable field
      { name: "Book.ts:28", fields: [], path: ["book"], fn: expect.any(Function) },
    ]);
  });

  it.withCtx("creates the right reactive derived values", async ({ em }) => {
    expect(getMetadata(Book).config.__data.reactiveDerivedValues).toEqual([
      { name: "numberOfBooks", fields: ["author"], path: ["author"], fn: expect.any(Function) },
      { name: "isPublic", fields: ["author"], path: ["reviews"], fn: expect.any(Function) },
    ]);
  });
});
