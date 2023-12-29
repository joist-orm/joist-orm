import { insertAuthor, insertBook, insertBookReview, insertComment, select } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";
import { AdminUser, Book, BookReview, Comment, SmallPublisher, isCommentParent, newBook } from "../entities";

describe("PolymorphicReference", () => {
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
    const adminUser = em.createPartial(AdminUser, { name: "a1", email: "test@test.com", role: "admin" });
    // And a small publisher
    const smallPublisher = em.createPartial(SmallPublisher, { name: "small", city: "city" });

    // When we set the favorite publisher
    adminUser.favoritePublisher.set(smallPublisher);

    // And flush
    await em.flush();

    // Then the favorite publisher is set
    expect(await adminUser.favoritePublisher.load()).toEqual(smallPublisher);
  });
});
