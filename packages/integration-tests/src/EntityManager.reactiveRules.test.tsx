import { Author, Book, Color, newAuthor, newBook } from "@src/entities";
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

  it.withCtx("creates the right reactive rules", async ({ em }) => {
    expect(getMetadata(Author).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: "Author.ts:114", fields: ["firstName"], path: [], fn: expect.any(Function) },
      // Author's "cannot have 13 books" rules
      { name: "Author.ts:121", fields: [], path: [], fn: expect.any(Function) },
      // Author's noop mentor rule
      { name: "Author.ts:128", fields: ["mentor"], path: [], fn: expect.any(Function) },
      // Author's immutable age rule (w/o age listed b/c it is immutable, but still needs to fire on create)
      { name: "Author.ts:136", fields: [], path: [], fn: expect.any(Function) },
      // Book's noop author.firstName rule, only depends on firstName
      { name: "Book.ts:14", fields: ["firstName"], path: ["books"], fn: expect.any(Function) },
      // Book's "too many colors" rule, only depends on favoriteColors, not firstName:ro
      { name: "Book.ts:19", fields: ["favoriteColors"], path: ["books"], fn: expect.any(Function) },
      { name: "Publisher.ts:42", fields: ["publisher"], path: ["publisher"], fn: expect.any(Function) },
    ]);

    expect(getMetadata(Book).config.__data.reactiveRules).toEqual([
      // Author's firstName/book.title validation rule
      { name: "Author.ts:114", fields: ["author", "title"], path: ["author"], fn: expect.any(Function) },
      // Author's "cannot have 13 books" rule
      { name: "Author.ts:121", fields: ["author"], path: ["author"], fn: expect.any(Function) },
      // Book's noop rule on author.firstName, if author changes
      { name: "Book.ts:14", fields: ["author"], path: [], fn: expect.any(Function) },
      // Book's "too many colors" rule, if author changes
      { name: "Book.ts:19", fields: ["author"], path: [], fn: expect.any(Function) },
    ]);
  });

  it.withCtx("creates the right reactive derived values", async ({ em }) => {
    expect(getMetadata(Book).config.__data.reactiveDerivedValues).toEqual([
      { name: "numberOfBooks", fields: ["author"], path: ["author"], fn: expect.any(Function) },
      { name: "isPublic", fields: ["author"], path: ["reviews"], fn: expect.any(Function) },
    ]);
  });
});
