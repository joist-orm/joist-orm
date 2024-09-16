import { EntityMetadata, noValue, testing } from "joist-orm";
import { Book, newAuthor, newBook, newUser } from "src/entities";
import { select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

const { getDefaultDependencies } = testing;

describe("EntityManager.defaults", () => {
  it("can default a synchronous field", async () => {
    const em = newEntityManager();
    // Create a new book with a defaulted notes
    const b = newBook(em, { title: "Book 1" });
    // Then the synchronous default was immediately applied
    expect(b.notes).toBe("Notes for Book 1");
  });

  it("can default a required synchronous field", async () => {
    const em = newEntityManager();
    // Create a new user with a defaulted original email
    const u = newUser(em, { email: "foo@foo.com" });
    // Then the factory didn't default our value as `originalEmail`
    expect(u.originalEmail).toBe("foo@foo.com");
  });

  it("does not overwrite existing sync default", async () => {
    const em = newEntityManager();
    // Create a new book with explicit notes
    const b = newBook(em, { title: "Book 1", notes: "my notes" });
    // Then the synchronous default did not overwrite them
    expect(b.notes).toBe("my notes");
  });

  it("can default an asynchronous field", async () => {
    const em = newEntityManager();
    // Given we create two books with their own author
    const a = newAuthor(em);
    const b1 = newBook(em, { author: a, order: undefined });
    const b2 = newBook(em, { author: a, order: undefined });
    // And the factory/sync default didn't get applied
    expect(b1.order).toBeUndefined();
    expect(b2.order).toBeUndefined();
    // When we flush
    await em.flush();
    // Then the async default kicked in
    expect(b1.order).toBe(1);
    expect(b2.order).toBe(2);
  });

  it("can default an asynchronous m2o field", async () => {
    const em = newEntityManager();
    // Given an author with lastName t1
    const a1 = newAuthor(em, { firstName: "f1", lastName: "t1" });
    await em.flush();
    // When we create a book with no author and a title of t1
    const b1 = newBook(em, { author: noValue(), title: "t1" });
    expect(b1.author.get).toBeUndefined();
    // When we flush
    await em.flush();
    // Then the async default kicked in
    expect(b1).toMatchEntity({ author: a1 });
    expect(await select("books")).toMatchObject([{ author_id: 1 }]);
  });

  it("does not overwrite existing async default", async () => {
    const em = newEntityManager();
    // Given we create two books with explicit orders
    const b1 = newBook(em, { author: {}, order: 3 });
    const b2 = newBook(em, { author: {}, order: 4 });
    // When we flush
    await em.flush();
    // Then the async default left them alone
    expect(b1.order).toBe(3);
    expect(b2.order).toBe(4);
  });

  it("supports cross-entity defaults", async () => {
    const em = newEntityManager();
    // Given we make both a book and author at the same time
    const a = newAuthor(em);
    const b = newBook(em);
    // When we flush
    await em.flush();
    // Then the b.notes default read the nickName default
    expect(a.nickNames).toEqual(["a1"]);
    expect(b.authorsNickNames).toBe("a1");
  });

  it("throws validation rules instead of NPEs in setDefaults accessing unset required relations", async () => {
    const em = newEntityManager();
    // The Book.authorsNickNames lambda *really* wants `author.get` to work, and it will
    // actively NPE during `em.flush`, but show that we suppress that error, and let the
    // more helpful validation error get thrown instead
    newBook(em, { author: noValue() });
    await expect(em.flush()).rejects.toThrow("Book#1 author is required");
  });

  describe("getDefaultDependencies", () => {
    it("works with primitives", () => {
      expect(getDeps(Book.metadata, "order")).toEqual([["Book", "order"]]);
    });

    it("works with nested primitives", () => {
      expect(getDeps(Book.metadata, { author: "nickNames" })).toEqual([
        ["Book", "author"],
        ["Author", "nickNames"],
      ]);
    });

    it("ignores non-defaults", () => {
      expect(getDeps(Book.metadata, { randomComment: "text", author: "title" })).toEqual([["Book", "author"]]);
    });

    it("ignores sync defaults", () => {
      expect(getDeps(Book.metadata, "notes")).toEqual([]);
    });
  });
});

// Wrap getDefaultDependencies and turn `meta` into a string for less-terrible Jest diffing
function getDeps(meta: EntityMetadata, hint: any): [string, string][] {
  const deps = getDefaultDependencies(meta, hint);
  return deps.map(({ meta, fieldName }) => [meta.type, fieldName]);
}
