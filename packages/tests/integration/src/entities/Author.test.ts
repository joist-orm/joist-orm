import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertComment,
  insertPublisher,
  select,
} from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { defaultValue, getMetadata, jan1, jan2 } from "joist-orm";
import { newPgConnectionConfig } from "joist-utils";
import pgStructure from "pg-structure";
import { Author, Book, BookId, Publisher, PublisherSize, newAuthor, newPublisher } from "../entities";
import { makeApiCall } from "../setupDbTests";
import { zeroTo } from "../utils";

const inspect = Symbol.for("nodejs.util.inspect.custom");

describe("Author", () => {
  it("can load an entity with a tagged id", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.find(Author, {});
    expect(a1[0].id).toEqual("a:1");
  });

  it("data for query", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBook({ title: "b3", author_id: 1 });
    await insertBookReview({ book_id: 3, rating: 5 });
    await insertComment({ parent_author_id: 1, text: "c1" });
    await insertComment({ parent_author_id: 1, text: "c2" });
    await insertComment({ parent_author_id: 1, text: "c3" });
  });

  it("can have business logic methods", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const books = await a1.books.load();
    expect(books.length).toEqual(0);
  });

  it("can have validation logic", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1", lastName: "a1" });
    await expect(em.flush()).rejects.toThrow("firstName and lastName must be different");
  });

  it("can have multiple validation rules", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "NotAllowedLastName", lastName: "NotAllowedLastName" });
    await expect(em.flush()).rejects.toThrow(
      "Validation errors (2): Author#1 firstName and lastName must be different, lastName is invalid",
    );
  });

  it("can have async validation rules", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    new Book(em, { title: "a1", author: a1 });
    await expect(em.flush()).rejects.toThrow(
      "Validation error: Author#1 A book title cannot be the author's firstName",
    );
  });

  it("can have reactive validation rules", async () => {
    const em = newEntityManager();
    // Given the book and author start out with acceptable names
    const a1 = em.create(Author, { firstName: "a1" });
    const b1 = em.create(Book, { title: "b1", author: a1 });
    await em.flush();
    // When the book name is later changed to collide with the author
    b1.title = "a1";
    // Then the validation rule is ran even though it's on the author entity
    await expect(em.flush()).rejects.toThrow(
      "Validation error: Author:1 A book title cannot be the author's firstName",
    );
  });

  it("can have reactive validation fired on new child", async () => {
    // Given the author has 12 books
    await insertAuthor({ first_name: "a1" });
    await Promise.all(zeroTo(12).map((n) => insertBook({ title: `b${n}`, author_id: 1 })));
    const em = newEntityManager();
    // When we add a 13th book
    const a1 = await em.load(Author, "1");
    const b1 = new Book(em, { title: "b1", author: a1 });
    // Then the Author validation rule fails
    await expect(em.flush()).rejects.toThrow("Author:1 An author cannot have 13 books");
  });

  it("can have reactive validation fired on deleted child", async () => {
    // Given the author has 14 books
    await insertAuthor({ first_name: "a1" });
    await Promise.all(zeroTo(14).map((n) => insertBook({ title: `b${n}`, author_id: 1 })));
    const em = newEntityManager();
    // When we delete the 14th book
    em.delete(await em.load(Book, "14"));
    // Then the Author validation rule fails
    await expect(em.flush()).rejects.toThrow("An author cannot have 13 books");
  });

  it("can have reactive validation fired on optional child", async () => {
    // Given the author has no publisher
    await insertAuthor({ first_name: "a1" });
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    // When we set the publisher
    const a1 = await em.load(Author, "1");
    a1.publisher.set(await em.load(Publisher, "1"));
    // Then flush doesn't blow up
    await em.flush();
  });

  it("does not fire reactive rules twice", async () => {
    // Given we have an existing author
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    // And we later make a book
    const b = em.create(Book, { title: "b", author: a });
    await em.flush();
    // Then book is only validated once
    expect(b.rulesInvoked).toEqual(1);
    expect(b.firstNameRuleInvoked).toEqual(1);
  });

  it("delete does not blow up due to reactive validation rules", async () => {
    // Given an author and book
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const b1 = await em.load(Book, "1");
    // When we change the book
    b1.title = "b2";
    // And the author that it would reactively trigger is deleted
    em.delete(a1);
    // Then it works b/c the author cascade delete takes precedence
    await em.flush();
  });

  it("cascading deletes does not blow up due to reactive validation rules", async () => {
    // Given an author and book
    await insertAuthor({ first_name: "a1", number_of_books: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const b1 = await em.load(Book, "1");
    // When we change the book
    b1.title = "b2";
    // And also delete it
    em.delete(b1);
    // And the book that it would reactively trigger is deleted
    em.delete(a1);
    // Then it works
    await em.flush();
  });

  it("can skip validations", async () => {
    // Given an author with the same first and last name
    // Given that a validation exists preventing the firstName and lastName from being the same values
    const em = newEntityManager();
    new Author(em, { firstName: "a1", lastName: "a1" });

    // When a flush occurs with the skipValidation option set to true
    // Then it does not throw an exception
    await expect(em.flush({ skipValidation: true })).resolves.toEqual([
      expect.objectContaining({
        firstName: "a1",
        lastName: "a1",
      }),
    ]);
  });

  it("can skip reactive validation rules", async () => {
    const em = newEntityManager();
    // Given the book and author start out with acceptable names
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    await em.flush();

    // When the book name is later changed to collide with the author
    b1.title = "a1";

    // Then the author validation rule can be skipped
    const result = await em.flush({ skipValidation: true });
    expect(result).toMatchEntity([a1, b1]);
  });

  it("skips the afterValidation hook when skipValidation is true", async () => {
    // Given an author with the same first and last name
    // Given that a validation exists preventing the firstName and lastName from being the same values
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1", lastName: "a1" });
    expect(a1.transientFields.afterValidationRan).toBe(false);

    // When a flush occurs with the skipValidation option set to true
    await em.flush({ skipValidation: true });

    // Then it does not run afterValidation hooks
    expect(a1.transientFields.afterValidationRan).toBe(false);
  });

  it("can have lifecycle hooks", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    expect(a1.transientFields.beforeFlushRan).toBe(false);
    expect(a1.transientFields.beforeCreateRan).toBe(false);
    expect(a1.transientFields.beforeUpdateRan).toBe(false);
    expect(a1.transientFields.afterCommitRan).toBe(false);
    expect(a1.transientFields.afterCommitIdIsSet).toBe(false);
    expect(a1.transientFields.afterCommitIsNewEntity).toBe(false);
    expect(a1.transientFields.afterValidationRan).toBe(false);
    expect(a1.transientFields.beforeDeleteRan).toBe(false);
    expect(a1.transientFields.beforeCommitRan).toBe(false);
    await em.flush();
    expect(a1.transientFields.beforeFlushRan).toBe(true);
    expect(a1.transientFields.beforeCreateRan).toBe(true);
    expect(a1.transientFields.beforeUpdateRan).toBe(false);
    expect(a1.transientFields.beforeDeleteRan).toBe(false);
    expect(a1.transientFields.afterValidationRan).toBe(true);
    expect(a1.transientFields.beforeCommitRan).toBe(true);
    expect(a1.transientFields.afterCommitRan).toBe(true);
    expect(a1.transientFields.afterCommitIdIsSet).toBe(true);
    expect(a1.transientFields.afterCommitIsNewEntity).toBe(true);
    a1.firstName = "new name";
    a1.transientFields.beforeCreateRan = false;
    await em.flush();
    expect(a1.transientFields.beforeCreateRan).toBe(false);
    expect(a1.transientFields.beforeUpdateRan).toBe(true);
    em.delete(a1);
    await em.flush();
    expect(a1.transientFields.beforeDeleteRan).toBe(true);
    expect(a1.transientFields.afterCommitIsDeletedEntity).toBe(true);
  });

  it("can access the context in hooks", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    await em.flush();
    expect(makeApiCall).toHaveBeenCalledWith("Author.beforeFlush");
  });

  describe("changes", () => {
    it("on create set fields are considered changed but not updated", async () => {
      const em = newEntityManager();
      const a1 = new Author(em, { firstName: "f1", lastName: "ln" });
      expect(a1.changes.firstName.hasChanged).toBe(true);
      expect(a1.changes.firstName.hasUpdated).toBe(false);
      expect(a1.changes.firstName.originalValue).toBe(undefined);
      expect(a1.changes.isPopular.hasChanged).toBe(false);
      expect(a1.changes.fields).toEqual(["createdAt", "updatedAt", "firstName", "lastName"]);
      a1.lastName = undefined;
      expect(a1.changes.lastName.hasChanged).toBe(false);
      expect(a1.changes.lastName.hasUpdated).toBe(false);
      expect(a1.changes.lastName.originalValue).toBe(undefined);
      expect(a1.changes.fields).toEqual(["createdAt", "updatedAt", "firstName"]);
    });

    it("after initial load nothing is considered changed", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "1");
      expect(a1.changes.firstName.hasChanged).toBe(false);
      expect(a1.changes.firstName.hasUpdated).toBe(false);
      expect(a1.changes.firstName.originalValue).toBe("a1");
      expect(a1.changes.fields).toEqual([]);
    });

    it("after initial load and mutate then hasChanged is true", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "1");
      expect(a1.changes.firstName.hasChanged).toBe(false);
      expect(a1.changes.firstName.hasUpdated).toBe(false);
      expect(a1.changes.firstName.originalValue).toBe("a1");
      expect(a1.changes.fields).toEqual([]);
      a1.firstName = "a2";
      expect(a1.changes.firstName.hasChanged).toBe(true);
      expect(a1.changes.firstName.hasUpdated).toBe(true);
      expect(a1.changes.firstName.originalValue).toEqual("a1");
      expect(a1.changes.fields).toEqual(["firstName"]);
    });

    it("after initial load of undefined and mutate then hasChanged is true", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "1");
      expect(a1.changes.lastName.hasChanged).toBe(false);
      expect(a1.changes.lastName.hasUpdated).toBe(false);
      expect(a1.changes.lastName.originalValue).toBe(undefined);
      expect(a1.changes.fields).toEqual([]);
      a1.lastName = "a2";
      expect(a1.changes.lastName.hasChanged).toBe(true);
      expect(a1.changes.lastName.hasUpdated).toBe(true);
      expect(a1.changes.lastName.originalValue).toBe(undefined);
      expect(a1.changes.fields).toEqual(["lastName"]);
      a1.lastName = undefined;
      expect(a1.changes.lastName.hasChanged).toBe(false);
      expect(a1.changes.lastName.hasUpdated).toBe(false);
      expect(a1.changes.lastName.originalValue).toBe(undefined);
      expect(a1.changes.fields).toEqual([]);
    });

    it("does not have collections", async () => {
      const em = newEntityManager();
      const a1 = new Author(em, { firstName: "f1", lastName: "ln" });
      // @ts-expect-error
      a1.changes.books;
    });

    it("has the right type for strings", async () => {
      const em = newEntityManager();
      const a1 = new Author(em, { firstName: "f1", lastName: "ln" });
      await em.flush();
      a1.firstName = "f11";
      expect(a1.changes.firstName.originalValue!.length).toEqual(2);
    });

    it("works for references", async () => {
      await insertPublisher({ name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1");
      const [p1, p2] = await em.loadAll(Publisher, ["p:1", "p:2"]);
      expect(a1.changes.publisher.hasChanged).toBe(false);
      expect(a1.changes.publisher.originalValue).toBe("p:1");
      expect(await a1.changes.publisher.originalEntity).toBe(p1);
      expect(a1.changes.fields).toEqual([]);
      a1.publisher.set(p2);
      expect(a1.changes.publisher.hasChanged).toBe(true);
      expect(a1.changes.publisher.originalValue).toEqual("p:1");
      const op = await a1.changes.publisher.originalEntity;
      expect(op).toBeInstanceOf(Publisher);
      expect(op!.isSizeLarge).toBe(false);
      expect(a1.changes.fields).toEqual(["publisher"]);
      a1.publisher.set(p1);
      expect(a1.changes.publisher.hasChanged).toBe(false);
      expect(await a1.changes.publisher.originalEntity).toBe(p1);
      expect(a1.changes.fields).toEqual([]);
    });

    it("works for dates", async () => {
      await insertAuthor({ first_name: "a1", graduated: jan1 });
      const em = newEntityManager();
      const a1 = await em.load(Author, "1");
      expect(a1.changes.graduated.originalValue).toEqual(jan1);
      expect(a1.changes.fields).toEqual([]);
      a1.graduated = jan2;
      expect(a1.changes.graduated.hasChanged).toBe(true);
      expect(a1.changes.graduated.hasUpdated).toBe(true);
      expect(a1.changes.graduated.originalValue).toEqual(jan1);
      expect(a1.changes.fields).toEqual(["graduated"]);
    });

    it("works for enums", async () => {
      await insertPublisher({ name: "p1", size_id: 1 });
      const em = newEntityManager();
      const a1 = await em.load(Publisher, "1");
      expect(a1.changes.size.originalValue).toEqual(PublisherSize.Small);
      expect(a1.changes.fields).toEqual([]);
      a1.size = PublisherSize.Large;
      expect(a1.changes.size.hasChanged).toBe(true);
      expect(a1.changes.size.hasUpdated).toBe(true);
      expect(a1.changes.size.originalValue).toEqual(PublisherSize.Small);
      expect(a1.changes.fields).toEqual(["size"]);
      // Make sure we don't put this key here, otherwise deep copies (like Jest diff failures) will fail
      expect("originalEntity" in a1.changes.size).toBe(false);
    });

    it("works for references with new entity", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em, { publisher: {} });
      expect(a1.changes.publisher.hasChanged).toBe(true);
      expect(a1.changes.publisher.hasUpdated).toBe(false);
      expect(a1.changes.publisher.originalValue).toBe(undefined);
    });

    it("works for references when already loaded", async () => {
      const em = newEntityManager();
      const [p1, p2] = [newPublisher(em), newPublisher(em)];
      const a1 = newAuthor(em, { publisher: p1 });
      expect(a1.changes.publisher.hasChanged).toBe(true);
      expect(a1.changes.publisher.hasUpdated).toBe(false);
      await em.flush();
      a1.publisher.set(p1);
      expect(a1.changes.publisher.hasChanged).toBe(false);
      expect(a1.changes.publisher.hasUpdated).toBe(false);
      a1.publisher.set(p2);
      expect(a1.changes.publisher.hasChanged).toBe(true);
      expect(a1.changes.publisher.hasUpdated).toBe(true);
      a1.publisher.set(p1);
      expect(a1.changes.publisher.hasChanged).toBe(false);
      expect(a1.changes.publisher.hasUpdated).toBe(false);
      expect(a1.publisher.get!.name).toBe("LargePublisher 1");
    });
  });

  it("can enforce validation rules", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.lastName = "l2";
    await expect(em.flush()).rejects.toThrow("Validation error: Author:1 lastName cannot be changed");
  });

  it("can set new opts", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1", lastName: "a1" });
    author.set({ firstName: "a2", lastName: "a2" });
    expect(author.firstName).toEqual("a2");
    expect(author.lastName).toEqual("a2");
  });

  it("cannot set empty string names", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "" });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("has strongly typed reference ids", () => {
    const author: Author = null!;
    let bookId: BookId = "1";
    // @ts-expect-error
    bookId = author?.mentor?.id!;
  });

  it("can set protected fields", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1", isPopular: true });
    expect(author.wasEverPopular).toEqual(true);
    await em.flush();
    // But they cannot be called directly
    expect(() => {
      // @ts-expect-error
      author.wasEverPopular = false;
    }).toThrow(TypeError);
  });

  it("setting optional fields to null is allowed", () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    author.set({ lastName: null });
    expect(author.lastName).toBeUndefined();
  });

  it("set can treat undefined as leave", () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    author.setPartial({ firstName: undefined });
    expect(author.firstName).toEqual("a1");
  });

  it("gets not-null validation rules for free", async () => {
    const em = newEntityManager();
    em.createPartial(Author, {});
    await expect(em.flush()).rejects.toThrow("Validation error: Author#1 firstName is required");
  });

  it("has an index on the publisher_id foreign key", async () => {
    // Ensures createEntityTable automatically creates indexes for foreign keys.
    const pgConfig = newPgConnectionConfig();
    const db = await pgStructure(pgConfig);
    const t = db.tables.find((t) => t.name === "authors")!;
    const i = t.indexes.find((i) => i.name === "authors_publisher_id_idx")!;
    expect(i).toBeDefined();
  });

  describe("isNewEntity", () => {
    it("is false after fetch for existing entities", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.findOneOrFail(Author, { firstName: "a1" });
      expect(a1.isNewEntity).toBe(false);
    });

    it("is true for new entities until they are flushed", async () => {
      const em = newEntityManager();
      const a1 = await em.create(Author, { firstName: "a1" });
      expect(a1.isNewEntity).toBe(true);
      await em.flush();
      expect(a1.isNewEntity).toBe(false);
    });
  });

  it("can populate itself easily", async () => {
    await insertAuthor({ first_name: "a1", age: 10 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const a2 = await a1.withLoadedBooks;
    expect(a2.books.get.length).toEqual(1);
  });

  it("can pass factory a key that requests the default value", async () => {
    const em = newEntityManager();
    // Note that `newAuthor` has it's own `firstName` default, which we're overriding here,
    // but that's more coincident, i.e. even if `newAuthor` didn't provide a default, this
    // is showing how expressions in FactoryOpts can set a key to "sometimes a value, sometimes
    // the factory default".
    const a1 = newAuthor(em, { firstName: defaultValue() });
    expect(a1.firstName).toEqual("firstName");
  });

  it("can request default values for non-required fields", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { lastName: defaultValue() });
    expect(a1.lastName).toEqual("lastName");
  });

  // Covers the New<Author> type supporting arrays
  it("can have favorite colors", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    expect(a1.favoriteColors.length).toEqual(0);
  });

  it("can have async properties", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    expect(await a1.numberOfBooks2.load()).toEqual(0);
    const a2 = await em.populate(a1, "numberOfBooks2");
    expect(a2.numberOfBooks2.get).toEqual(0);
  });

  it("can preload async properties", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    const a1 = newAuthor(em, { publisher: p1 });
    const pl = await p1.populate({ authors: { books: {}, numberOfBooks2: {} } });
    expect(pl.authors.get[0].numberOfBooks2.get).toEqual(0);
  });

  it("can load nested async properties of references", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { comments: [{}] }) as Author;
    // TODO a1.populate does not work due to lack of consts...needs TS 5.x
    const al = await em.populate(a1, { latestComment2: "parent" });
    expect(al.latestComment2.get!.parent.get).toEqual(al);
    // Ensure the `latestComment2.get` still has `| undefined`
    // @ts-expect-error
    expect(al.latestComment2.get.parent.get).toEqual(al);
  });

  it("can load nested async properties of collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { comments: [{}] }) as Author;
    // TODO a1.populate does not work due to lack of consts...needs TS 5.x
    const al = await em.populate(a1, { latestComments: "parent" });
    expect(al.latestComments.get[0].parent.get).toEqual(al);
  });

  it("has an em property", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    expect(a1.em).toEqual(em);
  });

  it("implements inspect for new entities", async () => {
    const em = newEntityManager();
    const [a1, a2] = [newAuthor(em), newAuthor(em)];
    expect((a1 as any)[inspect]()).toEqual("Author#1");
    expect((a2 as any)[inspect]()).toEqual("Author#2");
  });

  it("implements inspect for saved entities", async () => {
    const em = newEntityManager();
    const [a1, a2] = [newAuthor(em), newAuthor(em)];
    await em.flush();
    const a3 = newAuthor(em);
    expect((a1 as any)[inspect]()).toEqual("Author:1");
    expect((a2 as any)[inspect]()).toEqual("Author:2");
    expect((a3 as any)[inspect]()).toEqual("Author#3");
  });

  describe("cannotBeUpdated", () => {
    it("cannot change wasEverPopular to false", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1");
      a1.age = 101;
      await expect(em.flush()).rejects.toThrow("Author:1 age cannot be updated");
    });

    it("marks the field as immutable", async () => {
      const m = getMetadata(Author);
      expect(m.fields["age"].immutable).toBe(true);
    });
  });

  it("can access deleted children", async () => {
    // Given an author and two books
    await insertAuthor({ first_name: "a1", number_of_books: 2 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", { books: "author" });
    // When we delete the 2nd book
    const b2 = a.books.get[1];
    em.delete(b2);
    // Then we can still access both books via getWithDeleted
    expect(a.books.getWithDeleted.length).toBe(2);
    // And b2 still knows that author is/was its parent
    expect(b2.author.get).toBe(a);
    // Even though its deleted
    expect(b2.isPendingDelete).toBe(true);
  });

  it("isLoaded returns correctly when a field is nullable", async () => {
    // Given an author without a publisher that has two comments
    const em = newEntityManager();
    const a = newAuthor(em, { publisher: null, comments: [{}, {}] });
    // When we ask for latestComment
    const comment = a.latestComment.get;
    // Then it should succeed
    expect(comment).toEqual(a.comments.get[0]);
  });

  it("can access tagName", () => {
    expect(Author.tagName).toBe("a");
  });

  it("can access metadata", () => {
    expect(Author.metadata).toBe(getMetadata(Author));
  });

  it("can read bigints", async () => {
    await insertAuthor({ first_name: "a1", number_of_atoms: "9223372036854775807" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    expect(a.numberOfAtoms).toBe(9223372036854775807n);
  });

  it("can store bigints", async () => {
    const em = newEntityManager();
    const a = newAuthor(em, { numberOfAtoms: 9223372036854775807n });
    await em.flush();
    expect((await select("authors"))[0].number_of_atoms).toBe("9223372036854775807");
  });

  it("can filter bigints", async () => {
    await insertAuthor({ first_name: "a1", number_of_atoms: "9223372036854775807" });
    const em = newEntityManager();
    const authors = await em.find(Author, { numberOfAtoms: { gt: 1n } });
    expect(authors.length).toBe(1);
  });
});
