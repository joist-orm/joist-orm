import { newAuthor, newBook } from "@src/entities";

describe("EntityManager.reactiveRules", () => {
  it.withCtx("runs m2o reactive rules", async ({ em }) => {
    // Given a book
    const a = newAuthor(em, { firstName: "a1" });
    const b = newBook(em, { author: a });
    await em.flush();
    // And we initially first a rule watching author.firstName
    expect(b.firstNameRuleInvoked).toBe(1);
    // When the Author.firstName changes
    a.firstName = "a2";
    await em.flush();
    // Then the validation rule runs again
    expect(b.firstNameRuleInvoked).toBe(2);
  });
});
