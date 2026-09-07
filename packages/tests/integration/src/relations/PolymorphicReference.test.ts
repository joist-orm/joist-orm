import { expect } from "@jest/globals";
import { NoIdError, getInstanceData, getMetadata, isFieldSet } from "joist-orm";
import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertComment,
  insertTask,
  select,
  update,
} from "src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "src/testEm";

import {
  Author,
  Book,
  BookReview,
  Comment,
  TaskOld,
  isCommentParent,
  newAdminUser,
  newAuthor,
  newBook,
  newComment,
  newSmallPublisher,
  newTaskOld,
} from "../entities";

describe("PolymorphicReference", () => {
  it.each([null, 0, 1])("selects the first truthy component with author ID %p", async (authorId) => {
    // Given an Author whose ID can deliberately be zero to exercise the legacy truthiness check
    await insertAuthor({ id: authorId ?? 1, first_name: "a" });
    // And a Book that can be selected as the later polymorphic component
    await insertBook({ title: "b", author_id: authorId ?? 1 });
    // And a Comment with deliberately ambiguous parents when authorId is non-null, unlike a valid single parent
    await insertComment({ text: "c", parent_author_id: authorId ?? undefined, parent_book_id: 1 });
    // And a Comment hydrated from the real database row
    const em = newEntityManager();
    const comment = await em.load(Comment, "comment:1");
    const instance = getInstanceData(comment);
    const expected = authorId ? "a:1" : "b:1";
    // When decoding the Comment parent directly from its row
    // Then the first truthy component wins without caching the parent
    expect(getMetadata(Comment).fields.parent.serde!.fromRow(instance.rowData, instance.rowIndex)).toBe(expected);
    expect("parent" in instance.data).toBe(false);
    // When reading the parent reference's ID
    // Then the reference caches the same selected component
    expect(comment.parent.idMaybe).toBe(expected);
    expect(instance.data.parent).toBe(expected);
  });

  it.each([false, true])("caches an empty parent with isFieldSet read first %p", async (readIsFieldSetFirst) => {
    // Given a Comment with all parent columns SQL NULL
    await insertComment({ text: "c" });
    // And a hydrated Comment with no cached parent
    const em = newEntityManager();
    const comment = await em.load(Comment, "comment:1");
    const instance = getInstanceData(comment);
    // When inspecting the hydrated Comment before accessing its parent
    // Then no parent value has been cached
    expect("parent" in instance.data).toBe(false);
    // When decoding the all-NULL parent columns directly
    // Then the decoder returns undefined without caching it
    expect(getMetadata(Comment).fields.parent.serde!.fromRow(instance.rowData, instance.rowIndex)).toBeUndefined();
    expect("parent" in instance.data).toBe(false);
    // And the parent decoder is observed to detect repeated decoding
    const decode = jest.spyOn(getMetadata(Comment).fields.parent.serde!, "fromRow");
    try {
      // When checking field presence first in the enabled case
      // Then the hydrated NULL columns count as a field value
      if (readIsFieldSetFirst) expect(isFieldSet(comment, "parent")).toBe(true);
      // When reading the empty parent reference
      // Then an explicit undefined is cached regardless of which accessor ran first
      expect(comment.parent.idMaybe).toBeUndefined();
      expect("parent" in instance.data).toBe(true);
      expect(instance.data.parent).toBeUndefined();
      // When reading the parent ID and field presence again
      // Then the empty reference remains cached and the decoder has run only once
      expect(comment.parent.idMaybe).toBeUndefined();
      expect(isFieldSet(comment, "parent")).toBe(true);
      expect(comment.parent.isSet).toBe(false);
      expect(decode).toHaveBeenCalledTimes(1);
    } finally {
      decode.mockRestore();
    }
  });

  it.each([false, true])("replaces a cached Book parent during refresh with dirty data %p", async (dirty) => {
    // Given an Author available as a replacement parent
    await insertAuthor({ first_name: "a" });
    // And a Book that is the original parent
    await insertBook({ title: "b", author_id: 1 });
    // And the persisted Comment
    await insertComment({ text: "original", parent_book_id: 1 });
    // And its parent relationship is already loaded before refresh
    const em = newEntityManager();
    const comment = await em.load(Comment, "comment:1", "parent");
    // When inspecting the initially loaded parent
    // Then the Comment references the persisted Book
    expect(comment.parent.get).toBeInstanceOf(Book);
    expect(comment.parent.idMaybe).toBe("b:1");
    // And optionally dirty scalar and parent data exercises refresh with a cached entity instead of an ID
    if (dirty) {
      comment.text = "local";
      comment.parent.set(newBook(em));
    }
    // And database data has drifted to a different parent and scalar value
    await update("comments", { id: 1, parent_author_id: 1, parent_book_id: null, text: "database" });

    // When refreshing the Comment from the changed database row
    await em.refresh(comment);
    // Then the Author replaces the cached parent and database values replace any local changes
    expect(comment.parent.idMaybe).toBe("a:1");
    expect(getInstanceData(comment).data.parent).toBe("a:1");
    expect(comment.parent.get).toBe(await em.load(Author, "a:1"));
    expect(comment.text).toBe("database");
    expect(comment.changes.text.hasChanged).toBe(false);
    expect(comment.changes.parent.hasChanged).toBe(false);

    // And all database parent columns are now SQL NULL, replacing the loaded Author
    await update("comments", { id: 1, parent_author_id: null });
    // When refreshing the Comment after its database parent is cleared
    await em.refresh(comment);
    // Then the cached parent ID and loaded reference are cleared
    expect(comment.parent.idMaybe).toBeUndefined();
    expect(comment.parent.get).toBeUndefined();
    // When loading the cleared parent reference
    // Then it remains empty, cached, and unchanged
    expect(await comment.parent.load()).toBeUndefined();
    expect(comment.parent.isSet).toBe(false);
    expect(getInstanceData(comment).data.parent).toBeUndefined();
    expect(isFieldSet(comment, "parent")).toBe(true);
    expect(comment.changes.parent.hasChanged).toBe(false);
  });

  it.each([undefined, null])("fills a cached %p parent during refresh", async (cachedParent) => {
    // Given a Comment with no parent
    await insertComment({ text: "c" });
    // And an Author to become its parent
    await insertAuthor({ first_name: "a" });
    // And the hydrated Comment has an explicitly cached nullish parent
    const em = newEntityManager();
    const comment = await em.load(Comment, "comment:1");
    getInstanceData(comment).data.parent = cachedParent;
    // And the database now points to the Author
    await update("comments", { id: 1, parent_author_id: 1 });

    // When refreshing the Comment with a cached nullish parent
    await em.refresh(comment);
    // Then the persisted Author ID replaces the cached empty value
    expect(comment.parent.idMaybe).toBe("a:1");
  });

  it("can load a foreign key", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t", parent_book_id: 1 });

    const em = newEntityManager();
    const comment = await em.load(Comment, "1");
    const book = (await comment.parent.load()) as Book;
    expect(book.title).toEqual("t");
  });

  it("can load a null foreign key", async () => {
    await insertComment({ text: "t" });

    const em = newEntityManager();
    const comment = await em.load(Comment, "1", "parent");
    expect(comment.parent.get).toBeUndefined();
    expect(() => comment.parent.id).toThrow("Reference Comment:1.parent is unset");
  });

  it("can save a foreign key", async () => {
    const em = newEntityManager();
    const book = newBook(em);
    em.create(Comment, { text: "t", parent: book });
    await em.flush();

    const [row] = await select("comments");
    expect(row.parent_book_id).toEqual(1);
  });

  it("batch loads foreign keys", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertBook({ title: "t2", author_id: 2 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2", parent_book_id: 2 });

    const em = newEntityManager();
    const [c1, c2] = await Promise.all([em.load(Comment, "1"), em.load(Comment, "2")]);
    resetQueryCount();
    const [b1, b2] = (await Promise.all([c1.parent.load(), c2.parent.load()])) as Book[];
    expect(b1.title).toEqual("t1");
    expect(b2.title).toEqual("t2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can save changes to a foreign key", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertBook({ title: "t2", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const comment = await em.load(Comment, "1");
    comment.parent.set(book);
    await em.flush();

    const [row] = await select("comments");
    expect(row.parent_book_id).toEqual(2);
  });

  it("can save changes to foreign keys across different tables", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertBookReview({ rating: 0, book_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    const bookReview = await em.load(BookReview, "br:1");
    const comment = await em.load(Comment, "comment:1", "parent");
    expect(comment.parent.get).toEqual(book);
    comment.parent.set(bookReview);
    await em.flush();

    const [row] = await select("comments");
    expect(row.parent_book_id).toBeNull();
    expect(row.parent_book_review_id).toEqual(1);
  });

  it("can save changes to a foreign key pointing to a sub type", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "t1", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertTask({ type: "OLD" });

    const em = newEntityManager();
    const comment = await em.load(Comment, "comment:1");
    comment.parent.set(await em.load(TaskOld, "task:1"));
    await em.flush();

    const [row] = await select("comments");
    expect(row.parent_task_id).toEqual(1);
  });

  it("can save a foreign key pointing to a new sub type", async () => {
    const em = newEntityManager();
    newComment(em, { parent: newTaskOld(em) });
    await em.flush();

    expect(await select("comments")).toMatchObject([{ parent_task_id: 1 }]);
  });

  it("throws when trying to set an entity of the wrong type", async () => {
    const em = newEntityManager();
    const c1 = em.createPartial(Comment, {});
    const c2 = em.createPartial(Comment, {});

    expect(() => c1.parent.set(c2 as any)).toThrow("Comment#2 cannot be set as 'parent' on Comment#1");
  });

  it("removes deleted entities", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t", parent_book_id: 1 });

    const em = newEntityManager();
    const comment = await em.load(Comment, "1", "parent");
    const book = comment.parent.get as Book;
    em.delete(book);
    await em.flush({ skipValidation: true }); // need to skip validations because parent is required

    expect(comment.parent.get).toBeUndefined();
  });

  it("removes itself from other relations when deleted", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t", parent_book_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "1", "comments");
    const comment = book.comments.get[0];
    em.delete(comment);
    await em.flush();

    expect(book.comments.get).toEqual([]);
  });

  it("can discern Comment Parents from other types", async () => {
    const em = newEntityManager();
    const book = em.createPartial(Book, {});
    const comment = em.createPartial(Comment, {});

    expect(isCommentParent(book)).toBe(true);
    expect(isCommentParent(comment)).toBe(false);
    expect(isCommentParent({})).toBe(false);
    expect(isCommentParent(null)).toBe(false);
    expect(isCommentParent(undefined)).toBe(false);
  });

  it("can use base class parent", async () => {
    const em = newEntityManager();
    // Given an admin user (which extends user)
    // User has a polymorphic reference to a favorite publisher
    const adminUser = newAdminUser(em);
    // And a small publisher
    const smallPublisher = newSmallPublisher(em);

    // When we set the favorite publisher
    adminUser.favoritePublisher.set(smallPublisher);

    // And flush
    await em.flush();

    // Then the favorite publisher is set
    expect(await adminUser.favoritePublisher.load()).toEqual(smallPublisher);
  });

  it("can persist a polymorphic reference to an existing subtype", async () => {
    const em = newEntityManager();
    const smallPublisher = newSmallPublisher(em);
    await em.flush();

    const adminUser = newAdminUser(em);
    adminUser.favoritePublisher.set(smallPublisher);
    await em.flush();

    expect(await select("users")).toMatchObject([
      { favorite_publisher_large_id: null, favorite_publisher_small_id: 1 },
    ]);
  });

  it("rejects an ambiguous subtype id", () => {
    const em = newEntityManager();
    const adminUser = newAdminUser(em);

    expect(() => adminUser.favoritePublisher.set("p:1" as any)).toThrow(
      "p:1 cannot be set as 'favoritePublisher' on AdminUser#1",
    );
  });

  it("throws NoIdError from id", () => {
    const em = newEntityManager();
    const comment = newComment(em, { parent: newAuthor(em) });
    expect(() => comment.parent.id).toThrow(new NoIdError("Reference Comment#1.parent is assigned to a new entity"));
  });

  it("throws NoIdError from idIfSet", () => {
    const em = newEntityManager();
    const comment = newComment(em, { parent: newAuthor(em) });
    expect(() => comment.parent.idIfSet).toThrow(
      new NoIdError("Reference Comment#1.parent is assigned to a new entity"),
    );
  });
});
