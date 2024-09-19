import { insertAuthor } from "@src/entities/inserts";
import { EntityManager, MaybeAbstractEntityConstructor } from "joist-orm";
import {
  Author,
  Book,
  Comment,
  Image,
  ImageType,
  Publisher,
  SmallPublisher,
  Tag,
  newAuthor,
  newBook,
  newComment,
  newPublisher,
  newSmallPublisher,
} from "./entities";

import { newEntityManager } from "@src/testEm";

describe("EntityManager.clone", () => {
  it("can clone entities", async () => {
    const em = newEntityManager();

    // Given an entity
    const p1 = newPublisher(em, { name: "p1" });
    const a1 = new Author(em, { firstName: "a1", publisher: p1 });
    await em.flush();

    // When we clone that entity
    const a2 = await em.clone(a1);
    await em.flush();

    // Then we expect the cloned entity to have the same properties as the original
    expect(a2.firstName).toEqual(a1.firstName);
    expect(a2.publisher.id).toEqual(p1.id);
    expect(a2.id).not.toEqual(a1.id);
    expect(await numberOf(em, Author, Publisher)).toEqual([2, 1]);
    expect(p1.authors.get).toEqual([a1, a2]);
  });

  it("can clones subtype entities with base fields", async () => {
    const em = newEntityManager();

    // Given an entity
    const p1 = newSmallPublisher(em, { name: "p1" });
    await em.flush();

    // When we clone that entity
    const p2 = await em.clone(p1);
    await em.flush();

    // Then we expect the cloned entity to have the same properties as the original
    expect(p2.name).toEqual(p1.name);
    expect(p2.id).not.toEqual(p1.id);
    expect(p2).toBeInstanceOf(SmallPublisher);
  });

  it("can clone m2os and maintain loaded", async () => {
    // Given an entity created in 1 UoW
    const em = newEntityManager();
    const p1 = newPublisher(em, { name: "p1" });
    const a1 = new Author(em, { firstName: "a1", publisher: p1 });
    await em.flush();

    // When we clone it in a 2nd UoW
    const em2 = newEntityManager();
    const a2 = await em2.load(Author, a1.id);
    const a3 = await em2.clone(a2);

    // Then the a3.publisher loaded state is correct
    expect(a3.publisher.isLoaded).toBe(false);
  });

  it("can clone entities and referenced entities", async () => {
    // Given an entity with a reference to another entity
    {
      const em = newEntityManager();
      const a1 = newAuthor(em, { firstName: "a1" });
      const b1 = newBook(em, { title: "b1", author: a1 });
      // And the author itself points to the book we'll clone
      a1.currentDraftBook.set(b1);
      await em.flush();
    }

    // When we clone that entity and its reference
    // (and use a new EM to ensure Book.author is not loaded, to reproduce a duplication bug)
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1", "books");
    const b1 = await em.load(Book, "b:1");
    const a2 = await em.clone(a1, { deep: "books" });
    // And a1 was left alone
    expect(a1.books.get.length).toBe(1);
    await em.flush();

    // Then we expect the cloned entity to have a cloned copy of the original's reference
    expect(a2.books.get[0].title).toEqual(b1.title);
    // But the book is a different book
    const [b2] = a2.books.get;
    expect(b2).not.toBe(b1);
    // And a2 got updated to point to its cloned book
    expect(await a2.currentDraftBook.load()).toBe(b2);
  });

  it("can clone entities and referenced entities when already loaded", async () => {
    // Given an entity with a reference to another entity
    const em = newEntityManager();
    const a1 = newAuthor(em, { firstName: "a1" });
    const b1 = newBook(em, { title: "b1", author: a1 });
    // And the author itself points to the book we'll clone
    a1.currentDraftBook.set(b1);
    await em.flush();

    // When we clone that entity and its reference
    const a2 = await em.clone(a1, { deep: "books" });
    // And a1 was left alone
    expect(a1.books.get.length).toBe(1);
    await em.flush();

    // Then we expect the cloned entity to have a cloned copy of the original's reference
    expect(a2.books.get[0].title).toEqual(b1.title);
    // But the book is a different book
    const [b2] = a2.books.get;
    expect(b2).not.toBe(b1);
    // And a2 got updated to point to its cloned book
    expect(await a2.currentDraftBook.load()).toBe(b2);
  });

  it("can clone entities and referenced entities that are undefined", async () => {
    const em = newEntityManager();
    // Given an entity with a reference (publisher) that is not set
    const a1 = newAuthor(em, { firstName: "a1" });
    await em.flush();
    // When we clone that entity and its reference
    const a2 = await em.clone(a1, { deep: "publisher" });
    await em.flush();
    expect(a2).toMatchEntity({ publisher: undefined });
  });

  it("cannot clone many-to-many references", async () => {
    const em = newEntityManager();

    // Given an entity with a reference to another entity with a many-to-many reference
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    const t1 = new Tag(em, { name: "t1", books: [b1] });
    await em.flush();

    // When we clone that entity and its nested references, which include a many-to-many reference
    const promise = em.clone(a1, { deep: { books: "tags" } });

    // Then we expect the cloning to fail
    await expect(promise).rejects.toThrow("Uncloneable relation: tags");
  });

  it("can clone nested references", async () => {
    const em = newEntityManager();

    // Given an entity with a reference to another entity with a one-to-one
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    const i1 = new Image(em, { fileName: "11", type: ImageType.BookImage, book: b1 });
    await em.flush();

    // When we clone that entity and its nested references
    const a2 = await em.clone(a1, { deep: { books: "image" } });
    await em.flush();

    // Then we expect the cloned entity to have cloned copies of all its nested references
    const b2 = (await a2.books.load())[0];
    const i2 = await b2.image.load();
    expect(i2).toBeDefined();
    expect(i2).not.toEqual(i1);
    expect(i2?.fileName).toEqual(i1.fileName);
    expect(i2?.type).toEqual(i1.type);
    expect(await numberOf(em, Author, Book, Image)).toEqual([2, 2, 2]);
  });

  it("should only clone referenced entities when specified", async () => {
    const em = newEntityManager();

    // Given an entity with a reference to another entity
    const a1 = new Author(em, { firstName: "a1", books: [newBook(em)] });
    await em.flush();

    // When we clone that entity and don't pass a populate hint for the reference
    const a2 = await em.clone(a1);
    await em.flush();

    // Then we expect the cloned entity to have no references
    expect(await a2.books.load()).toHaveLength(0);
  });

  it("can clone entities and report what has changed", async () => {
    const em = newEntityManager();
    // Given an entity
    const p1 = newPublisher(em, { name: "p1" });
    const a1 = new Author(em, { firstName: "a1", publisher: p1 });
    await em.flush();
    // When we clone that entity
    const a2 = await em.clone(a1);
    // Then it is new
    expect(a2.isNewEntity).toBe(true);
    // And all the fields look changed
    expect(a2.changes.fields).toEqual([
      "createdAt",
      "updatedAt",
      "firstName",
      "nickNames",
      "favoriteColors",
      "publisher",
    ]);
    // And if we revert the publisher
    a2.publisher.set(undefined);
    // Then it is no longer changed
    expect(a2.changes.publisher.hasChanged).toBe(false);
    expect(a2.changes.publisher.hasUpdated).toBe(false);
    expect(a2.changes.publisher.originalValue).toBe(undefined);
    expect(a2.changes.fields).toEqual(["createdAt", "updatedAt", "firstName", "nickNames", "favoriteColors"]);
  });

  it("can clone entities and report what has changed w/undefined m2o", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    // Given we load an existing entity
    const a1 = await em.load(Author, "a:1");
    // When we clone that entity
    const a2 = await em.clone(a1);
    // Then it is new
    expect(a2.isNewEntity).toBe(true);
    // And only the currently set fields look changed
    expect(a2.changes.fields).toEqual(["createdAt", "updatedAt", "firstName", "favoriteColors"]);
    // And specifically the publisher is not changed
    expect(a2.changes.publisher.hasChanged).toBe(false);
    expect(a2.changes.publisher.hasUpdated).toBe(false);
    expect(a2.changes.publisher.originalValue).toBe(undefined);
  });

  it("can clone polymorphic references", async () => {
    const em = newEntityManager();
    // Given an entity that is a polymorphic parent of two children
    const a1 = newAuthor(em, { comments: [{}, {}] });
    await em.flush();
    // When we clone the entity
    const a2 = await em.clone(a1, { deep: "comments" });
    await em.flush();
    // Then we expect the cloned entity to have cloned copies of all its nested references
    expect(a2.comments.get.length).toBe(2);
    expect(a2.comments.get[0].id).toBe("comment:3");
    expect(a2.comments.get[1].id).toBe("comment:4");
    expect(a2.comments.get[0].parent.get).toBe(a2);
  });

  it("can clone polymorphic references directly", async () => {
    const em = newEntityManager();
    // Given an entity with a polymorphic parent
    const c1 = newComment(em, { parent: {} });
    expect(c1.parent.get).toBeInstanceOf(Author);
    await em.flush();
    // When we clone it in a new UoW
    const em2 = newEntityManager();
    const c2 = await em2.load(Comment, c1.id);
    const c3 = await em2.clone(c2);
    // Then the parent can be loaded
    expect(await c3.parent.load()).toBeInstanceOf(Author);
  });

  it("can clone a collection of entities", async () => {
    const em = newEntityManager();

    // Given an author with 2 books, both of which have comments
    const a1 = newAuthor(em, {
      firstName: "a1",
      books: [
        { title: "b1", comments: [{ text: "Great book!" }] },
        { title: "b2", comments: [{ text: "Ok book" }] },
      ],
    });
    const [b1, b2] = a1.books.get;
    await em.flush();

    // When I ask to clone just the books
    const [b3, b4, ...others] = await em.clone(a1.books.get, {
      deep: "comments",
    });
    await em.flush();

    // Then we expect the author to now have 4 books
    expect(a1.books.get).toHaveLength(4);
    expect(b3.title).toEqual(b1.title);
    expect(b3).not.toEqual(b1);
    expect(b4.title).toEqual(b2.title);
    expect(b4).not.toEqual(b2);
    // And only one author exists, and comments were also cloned
    expect(await numberOf(em, Author, Book, Comment)).toEqual([1, 4, 4]);
    // And that only the clones of the original entities are included in the result
    expect(others).toHaveLength(0);
  });

  it("returns empty array when entire collection of entities is skipped", async () => {
    const em = newEntityManager();

    // Given an author with 2 books, both of which have comments
    const a1 = newAuthor(em, {
      books: [{}, {}],
    });
    await em.flush();

    // When I ask to clone just the books, but skip them all
    const clones = await em.clone(a1.books.get, { skipIf: () => true });
    const result = await em.flush();

    // Then I expect clones to be empty
    expect(clones).toHaveLength(0);
    // And nothing was saved
    expect(result).toHaveLength(0);
    // And only one author and 2 books exist
    expect(await numberOf(em, Author, Book)).toEqual([1, 2]);
  });

  it("calls postClone for each cloned entity", async () => {
    const em = newEntityManager();

    // Given an author with 2 books, both of which have comments
    const a1 = newAuthor(em, {
      firstName: "a1",
      books: [
        { title: "b1", comments: [{ text: "Great book!" }] },
        { title: "b2", comments: [{ text: "Ok book" }] },
      ],
    });
    await em.flush();
    // When we clone the author
    const postClone = jest.fn();
    await em.clone(a1, { deep: { books: "comments" }, postClone });
    // Then I expect `postClone` was called once for each entity to be cloned
    expect(postClone).toHaveBeenCalledTimes(5);
  });

  describe("skipIf", () => {
    it("can skip the main entity you asked to clone", async () => {
      const em = newEntityManager();
      // Given an entity to clone
      const p1 = newPublisher(em, { name: "p1" });
      await em.flush();
      // When I attempt to clone it, but ask to skip the entity
      await expect(em.clone(p1, { skipIf: (e) => e === p1 }))
        // Then I expect it to fail
        .rejects.toThrow("no entities were cloned given the provided option");
    });

    it("can skip cloning child entity trees", async () => {
      const em = newEntityManager();

      // Given an author with 2 books, both of which have comments
      const a1 = newAuthor(em, {
        firstName: "a1",
        books: [
          { title: "b1", comments: [{ text: "Great book!" }] },
          { title: "b2", comments: [{ text: "Ok book" }] },
        ],
      });
      await em.flush();

      // When we clone the book, but ask to skip `b2`
      const a2 = await em.clone(a1, {
        deep: { books: "comments" },
        // Skip B2, it is only Ok
        skipIf: (e) => e instanceof Book && e.title === "b2",
      });
      await em.flush();

      // Then we expect the cloned entity to have a cloned copy of the `b1` only
      expect(a2.books.get).toHaveLength(1);
      // But the book is a different book
      expect(a2.books.get[0]).not.toBe(a1.books.get[0]);
      // And only one comment entity was cloned
      expect(await numberOf(em, Author, Book, Comment)).toEqual([2, 3, 3]);
    });
  });

  it("can protected fields", async () => {
    // Given an entity created and set a protected field
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1", isPopular: true });
    expect(a1.wasEverPopular).toBe(true);
    // When we clone it
    const a2 = await em.clone(a1);
    // Then the clone got the same value (...although that is b/c for this test,
    // it went through the same codepath, and didn't actually copy the value)
    expect(a2.wasEverPopular).toBe(true);
    await em.flush();
  });
});

async function numberOf(em: EntityManager, ...args: MaybeAbstractEntityConstructor<any>[]): Promise<number[]> {
  return Promise.all(
    args.map(async (ec) => {
      const entities = await em.find(ec, {});
      return entities.length;
    }),
  );
}
