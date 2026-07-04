import { Author, Book } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";
import { stripAnsi } from "joist-utils";
import { describe, expect, it } from "vitest";

// These exercise `toMatchEntity` under Vitest. Before the runner-detection fix in
// `joist-test-utils`, every one of these threw `this.assert is not a function` because Vitest
// also populates the `$$jest-matchers-object` symbol and the matcher took the Jest fast-path.
describe("toMatchEntity", () => {
  it("matches a subset of primitive fields", () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1", lastName: "last" });
    expect(a).toMatchEntity({ firstName: "a1" });
  });

  it("unwraps a m2o relation", () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    const b = em.create(Book, { title: "b1", author: a });
    expect(b).toMatchEntity({ title: "b1", author: { firstName: "a1" } });
  });

  it("unwraps a m2o relation nested in a POJO", () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    expect({ author: a }).toMatchEntity({ author: { firstName: "a1" } });
  });

  it("matches when actual is a bare entity", () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    // `expected` collapses to the tagged id, so this hits the non-object branch.
    expect(a).toMatchEntity(a);
  });

  it("unwraps an o2m collection into an array", () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    em.create(Book, { title: "b1", author: a });
    em.create(Book, { title: "b2", author: a });
    expect(a).toMatchEntity({ books: [{ title: "b1" }, { title: "b2" }] });
  });

  it("re-adds soft-deleted entities into collections", () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    em.create(Book, { title: "b1", author: a });
    const b2 = em.create(Book, { title: "b2", author: a });
    b2.deletedAt = new Date();
    // `.get` hides the soft-deleted book...
    expect(a.books.get).toMatchEntity([{ title: "b1" }]);
    // ...but `toMatchEntity` re-adds it, since it only hides hard-deletes.
    expect(a).toMatchEntity({ books: [{ title: "b1" }, { title: "b2" }] });
  });

  // On failure, Vitest should render a `toMatchObject`-style diff (entities shown as their tagged
  // ids, collections as arrays), not the default `expect([object Object]).toMatchEntity(...)`.
  describe("failure diffs", () => {
    it("diffs a mismatched primitive", () => {
      const em = newEntityManager();
      const a = em.create(Author, { firstName: "a1" });
      expect(matchError(() => expect(a).toMatchEntity({ firstName: "a2" }))).toMatchInlineSnapshot(`
        "expect(received).toMatchEntity(expected)

        - Expected
        + Received

          {
        -   "firstName": "a2",
        +   "firstName": "a1",
          }"
      `);
    });

    it("diffs a mismatched m2o reference", () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      const a2 = em.create(Author, { firstName: "a2" });
      const b = em.create(Book, { title: "b1", author: a1 });
      expect(matchError(() => expect(b).toMatchEntity({ author: a2 }))).toMatchInlineSnapshot(`
        "expect(received).toMatchEntity(expected)

        - Expected
        + Received

          {
        -   "author": "a#2",
        +   "author": "a#1",
          }"
      `);
    });

    it("diffs a missing entity in a collection", () => {
      const em = newEntityManager();
      const a = em.create(Author, { firstName: "a1" });
      em.create(Book, { title: "b1", author: a });
      const b2 = em.create(Book, { title: "b2", author: a });
      expect(matchError(() => expect(a).toMatchEntity({ books: [b2] }))).toMatchInlineSnapshot(`
        "expect(received).toMatchEntity(expected)

        - Expected
        + Received

          {
            "books": [
        +     "b#1",
              "b#2",
            ],
          }"
      `);
    });

    it("diffs an extra entity in a collection", () => {
      const em = newEntityManager();
      const a = em.create(Author, { firstName: "a1" });
      const b1 = em.create(Book, { title: "b1", author: a });
      const b2 = em.create(Book, { title: "b2", author: em.create(Author, { firstName: "a2" }) });
      expect(matchError(() => expect(a).toMatchEntity({ books: [b1, b2] }))).toMatchInlineSnapshot(`
        "expect(received).toMatchEntity(expected)

        - Expected
        + Received

          {
            "books": [
              "b#1",
        -     "b#2",
            ],
          }"
      `);
    });

    it("diffs a mismatched array order", () => {
      const em = newEntityManager();
      const a1 = em.create(Author, { firstName: "a1" });
      const a2 = em.create(Author, { firstName: "a2" });
      expect(matchError(() => expect([a1, a2]).toMatchEntity([a2, a1]))).toMatchInlineSnapshot(`
        "expect(received).toMatchEntity(expected)

        - Expected
        + Received

          [
        -   "a#2",
            "a#1",
        +   "a#2",
          ]"
      `);
    });
  });
});

/** Runs a failing `toMatchEntity` and returns its (ANSI-stripped) diff message. */
function matchError(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return stripAnsi((e as Error).message);
  }
  throw new Error("expected toMatchEntity to fail");
}
