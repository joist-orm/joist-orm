import { Author, Book, Color, newAuthor, newBook, newPublisher } from "@src/entities";
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

  it.withCtx("creates the right reactive rules", async ({ em }) => {
    expect(getMetadata(Author).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: "Author.ts:113", fields: ["firstName"], reversePath: [], rule: expect.any(Function) },
      // Author's "cannot have 13 books" rules
      { name: "Author.ts:120", fields: [], reversePath: [], rule: expect.any(Function) },
      // Author's noop mentor rule
      { name: "Author.ts:127", fields: ["mentor"], reversePath: [], rule: expect.any(Function) },
      // Author's immutable age rule (w/o age listed b/c it is immutable, but still needs to fire on create)
      { name: "Author.ts:135", fields: [], reversePath: [], rule: expect.any(Function) },
      // Book's noop author.firstName rule, only depends on firstName
      { name: "Book.ts:15", fields: ["firstName"], reversePath: ["books"], rule: expect.any(Function) },
      // Book's "too many colors" rule, only depends on favoriteColors, not firstName:ro
      { name: "Book.ts:20", fields: ["favoriteColors"], reversePath: ["books"], rule: expect.any(Function) },
      { name: "Publisher.ts:42", fields: ["publisher"], reversePath: ["publisher"], rule: expect.any(Function) },
    ]);

    expect(getMetadata(Book).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: "Author.ts:113", fields: ["author", "title"], reversePath: ["author"], rule: expect.any(Function) },
      // Author's "cannot have 13 books" rule
      { name: "Author.ts:120", fields: ["author"], reversePath: ["author"], rule: expect.any(Function) },
      // Book's noop rule on author.firstName, if author changes
      { name: "Book.ts:15", fields: ["author"], reversePath: [], rule: expect.any(Function) },
      // Book's "too many colors" rule, if author changes
      { name: "Book.ts:20", fields: ["author"], reversePath: [], rule: expect.any(Function) },
      // Book's "numberOfBooks2" rule
      { name: "Book.ts:28", fields: ["author"], reversePath: [], rule: expect.any(Function) },
      { name: "Book.ts:28", fields: ["author"], reversePath: ["author", "books"], rule: expect.any(Function) },
    ]);
  });
});
