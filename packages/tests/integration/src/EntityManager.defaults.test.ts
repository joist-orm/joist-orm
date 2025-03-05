import { EntityMetadata, noValue, testing } from "joist-orm";
import { Author, Book, newAuthor, newBook, newUser, SmallPublisher } from "src/entities";
import { select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

const { getDefaultDependencies } = testing;

// We don't have tests for:
// - default-defined-on-base pushing into child
// - default-defined-on-base that inserts both a base and a child (and doesn't double tap the Deferred.resolve)
// - default-defined-on-sub

describe("EntityManager.defaults", () => {
  it("can default a synchronous field", async () => {
    const em = newEntityManager();
    // Create a new book with a defaulted notes
    const b = newBook(em, { title: "Book 1" });
    // Then the synchronous default was immediately applied
    expect(b.notes).toBe("Notes for Book 1");
  });

  it("can schema default a falsey value", async () => {
    const em = newEntityManager();
    const a = em.create(Author, { firstName: "a1" });
    // Then the synchronous default was immediately applied
    expect(a.isFunny).toBe(false);
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

  it("does not overwrite existing sync default set to undefined", async () => {
    const em = newEntityManager();
    // Create a new book with explicit notes
    const b = em.create(Book, {
      title: "Book 1",
      notes: undefined,
    });
    // Then the synchronous default did not overwrite them
    expect(b.notes).toBeUndefined();
  });

  it("can default an asynchronous field", async () => {
    const em = newEntityManager();
    // Given we create two books with their own author
    const a = newAuthor(em);
    const b1 = newBook(em, { author: a, order: undefined });
    const b2 = newBook(em, { author: a, order: undefined });
    // And the factory/sync default got applied (neat!)
    expect(b1.order).toBe(1);
    expect(b2.order).toBe(2);
    // When we flush
    await em.flush();
    // The defaults stayed
    expect(b1.order).toBe(1);
    expect(b2.order).toBe(2);
  });

  it("can default an asynchronous field via em.setDefaults", async () => {
    const em = newEntityManager();
    // Given we create two books with their own author
    const a = newAuthor(em);
    // And we use em.create instead of the factory
    const b1 = em.create(Book, { author: a, title: "b1" });
    const b2 = em.create(Book, { author: a, title: "b2" });
    // And the default didn't run
    expect(b1.order).toBeUndefined();
    expect(b2.order).toBeUndefined();
    // When assign the defaults
    await em.setDefaults([b1, b2]);
    // Then the defaults were set
    expect(b1.order).toBe(1);
    expect(b2.order).toBe(2);
  });

  it("skips default for an already-set reference", async () => {
    const em = newEntityManager();
    // Given we create a Publisher (w/o going through the factory triggered defaults)
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    // And explicitly set the spotlightAuthor to undefined
    p.spotlightAuthor.set(undefined);
    // Even though there are authors that the setDefault could use
    newAuthor(em, { publisher: p });
    // When we flush
    await em.flush();
    // The spotlightAuthor stays unassigned
    expect(p).toMatchEntity({ spotlightAuthor: undefined });
  });

  it("re-tries defaults during em.flush", async () => {
    const em = newEntityManager();
    // Given we create a Publisher (w/o going through the factory triggered defaults)
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    // And invoke `em.setDefaults`
    await em.setDefaults([p]);
    // And the spotlightAuthor default returned undefined
    expect(p).toMatchEntity({ spotlightAuthor: undefined });
    // When we create data that would trigger the default, and em.flush
    const a = newAuthor(em, { publisher: p });
    await em.flush();
    // Then the default is tried again
    expect(p).toMatchEntity({ spotlightAuthor: a });
  });

  it("can default an asynchronous m2o field", async () => {
    const em = newEntityManager();
    // Given an author with lastName t1
    const a1 = newAuthor(em, { firstName: "f1", lastName: "t1" });
    await em.flush();
    // When we create a book with no reviewer and a title of t1
    const b1 = em.create(Book, { title: "t1", author: a1 });
    expect(b1.reviewer.get).toBeUndefined();
    // When we flush
    await em.flush();
    // Then the async default kicked in
    expect(b1).toMatchEntity({ reviewer: a1 });
    expect(await select("books")).toMatchObject([{ reviewer_id: 1 }]);
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

  it("supports defaults specified via hasDefault config", async () => {
    const em = newEntityManager();
    const sp = em.create(SmallPublisher, { name: "p1" });
    await em.flush();
    expect(sp.city).toEqual("default city");
  });

  describe("getDefaultDependencies", () => {
    it("works with primitives", () => {
      expect(getDeps(Book.metadata, "someField", "order")).toEqual([["Book", "order"]]);
    });

    it("works with nested primitives", () => {
      expect(getDeps(Book.metadata, "authorsNickNames", { author: "nickNames" })).toEqual([
        ["Book", "author"],
        ["Author", "nickNames"],
      ]);
    });

    it("ignores non-defaults", () => {
      expect(getDeps(Book.metadata, "authorsNickNames", { randomComment: "text", author: "title" })).toEqual([
        ["Book", "author"],
      ]);
    });

    it("ignores sync defaults", () => {
      expect(getDeps(Book.metadata, "order", "notes")).toEqual([]);
    });

    it("ignores cyclic defaults", () => {
      expect(getDeps(Author.metadata, "notes", "notes")).toEqual([]);
    });
  });
});

// Wrap getDefaultDependencies and turn `meta` into a string for less-terrible Jest diffing
function getDeps(meta: EntityMetadata, fieldName: string, hint: any): [string, string][] {
  const deps = getDefaultDependencies(meta, fieldName, hint);
  return deps.map(({ meta, fieldName }) => [meta.type, fieldName]);
}
