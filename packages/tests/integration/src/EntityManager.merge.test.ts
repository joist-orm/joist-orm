import {
  insertAuthor,
  insertBook,
  insertBookToTag,
  insertComment,
  insertImage,
  insertPublisher,
  insertTag,
} from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { EntityManager, MaybeAbstractEntityConstructor } from "joist-orm";
import { Author, Book, Comment, Image, Publisher, Tag } from "./entities";

describe("EntityManager.merge", () => {
  it("can merge one source and one target", async () => {
    const em = newEntityManager();
    // Given two authors with books
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertAuthor({ id: 2, first_name: "a2" });
    await insertBook({ id: 1, title: "b1", author_id: 1 });
    await insertBook({ id: 2, title: "b2", author_id: 2 });

    const [a1, a2] = await em.find(Author, {});
    const [b1, b2] = await em.find(Book, {});

    // When we merge a2 into a1
    await em.merge(a1, [a2]);
    // Populate the books collection for the assertion
    await em.populate(a1, "books");
    // Then a1 should have both books
    expect(a1).toMatchEntity({ books: [b1, b2] });
    // And b2 should now point to a1
    expect(await b2.author.load()).toBe(a1);
    // And the source author should be automatically deleted
    await em.flush();
    expect(await numberOf(em, Author, Book)).toEqual([1, 2]);
  });

  it("can merge multiple sources into one target", async () => {
    const em = newEntityManager();
    // Given three publishers with authors
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertPublisher({ id: 3, name: "p3" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
    await insertAuthor({ id: 2, first_name: "a2", publisher_id: 2 });
    await insertAuthor({ id: 3, first_name: "a3", publisher_id: 3 });

    const [p1, p2, p3] = await em.find(Publisher, {});
    const [a1, a2, a3] = await em.find(Author, {});

    // When we merge p2 and p3 into p1
    await em.merge(p1, [p2, p3]);
    // Populate the authors collection for the assertion
    await em.populate(p1, "authors");
    // Then p1 should have all three authors
    expect(p1).toMatchEntity({ authors: [a1, a2, a3] });
    await em.flush();
    // And the source publishers should be automatically deleted
    expect(await numberOf(em, Author, Publisher)).toEqual([3, 1]);
  });

  it("handles one-to-one relationships", async () => {
    const em = newEntityManager();
    // Given one book with an image, and another book without an image
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 1, title: "b1", author_id: 1 });
    await insertBook({ id: 2, title: "b2", author_id: 1 });
    await insertImage({ id: 1, file_name: "i2", type_id: 1, book_id: 2 }); // type_id: 1 = BookImage

    const [b1, b2] = await em.find(Book, {});
    const [i2] = await em.find(Image, {});

    // When we merge b2 into b1
    await em.merge(b1, [b2]);
    await em.flush();
    // Then i2 should now point to b1
    expect(await i2.book.load()).toBe(b1);
    expect(await b1.image.load()).toBe(i2);
    // And the source book should be automatically deleted
    expect(await numberOf(em, Author, Book, Image)).toEqual([1, 1, 1]);
  });

  it("handles many-to-many relationships", async () => {
    const em = newEntityManager();
    // Given two books with different tags
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertTag({ id: 1, name: "t1" });
    await insertTag({ id: 2, name: "t2" });
    await insertBook({ id: 1, title: "b1", author_id: 1 });
    await insertBook({ id: 2, title: "b2", author_id: 1 });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    await insertBookToTag({ book_id: 2, tag_id: 2 });

    const [b1, b2] = await em.find(Book, {});
    const [t1, t2] = await em.find(Tag, {});

    // When we merge b2 into b1
    await em.merge(b1, [b2]);
    await em.flush();
    // Populate the collections for the assertions
    await em.populate(t2, "books");
    await em.populate(b1, "tags");
    // Then t2 should now point to b1
    expect(t2).toMatchEntity({ books: [b1] });
    // And b1 should have both tags
    expect(await b1.tags.load()).toHaveLength(2);
    expect(await b1.tags.load()).toContain(t1);
    expect(await b1.tags.load()).toContain(t2);
    // And the source book should be automatically deleted
    expect(await numberOf(em, Author, Book, Tag)).toEqual([1, 1, 2]);
  });

  it("handles empty collections", async () => {
    const em = newEntityManager();
    // Given two authors, one with books and one without
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertAuthor({ id: 2, first_name: "a2" }); // no books
    await insertBook({ id: 1, title: "b1", author_id: 1 });

    const [a1, a2] = await em.find(Author, {});
    const [b1] = await em.find(Book, {});

    // When we merge a2 into a1
    await em.merge(a1, [a2]);
    await em.flush();
    // Populate the books collection for the assertion
    await em.populate(a1, "books");
    // Then a1 should still have just its one book
    expect(a1).toMatchEntity({ books: [b1] });
    // And the source author should be automatically deleted
    expect(await numberOf(em, Author, Book)).toEqual([1, 1]);
  });

  it("does nothing when merging with no sources", async () => {
    const em = newEntityManager();
    await insertAuthor({ id: 1, first_name: "a1" });

    const [a1] = await em.find(Author, {});

    // When we merge with no sources
    await em.merge(a1, []);
    await em.flush();
  });

  it("throws error when merging different entity types", async () => {
    const em = newEntityManager();
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertPublisher({ id: 1, name: "p1" });

    const [a1] = await em.find(Author, {});
    const [p1] = await em.find(Publisher, {});

    // When we try to merge different types
    await expect(em.merge(a1 as any, [p1 as any])).rejects.toThrow("Cannot merge entities of different types");
  });

  it("handles polymorphic relationships", async () => {
    const em = newEntityManager();
    // Given two authors with comments
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertAuthor({ id: 2, first_name: "a2" });
    await insertComment({ id: 1, text: "c1", parent_author_id: 1 });
    await insertComment({ id: 2, text: "c2", parent_author_id: 2 });

    const [a1, a2] = await em.find(Author, {});
    const [c1, c2] = await em.find(Comment, {});

    // When we merge c2 into c1
    await em.merge(c1, [c2]);
    await em.flush();
    // Populate the comments collection for the assertion
    await em.populate(a1, "comments");
    // Then a1 should have only c1 b/c c2 was deleted
    expect(a1).toMatchEntity({ comments: [c1] });
    // And the source comment should be automatically deleted
    expect(await numberOf(em, Author, Comment)).toEqual([2, 1]);
  });

  it("works across different UoWs", async () => {
    // Given entities created via raw SQL
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
    await insertAuthor({ id: 2, first_name: "a2", publisher_id: 2 });

    // When we merge in a UoW
    const em2 = newEntityManager();
    const [p1, p2] = await em2.find(Publisher, {});

    await em2.merge(p1, [p2]);
    await em2.flush();

    // Then the merge worked correctly
    expect(await p1.authors.load()).toHaveLength(2);

    // And the source publisher should be automatically deleted
    expect(await numberOf(em2, Author, Publisher)).toEqual([2, 1]);
  });

  it("can disable auto-delete with option", async () => {
    const em = newEntityManager();
    // Given two authors with books
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertAuthor({ id: 2, first_name: "a2" });
    await insertBook({ id: 1, title: "b1", author_id: 1 });
    await insertBook({ id: 2, title: "b2", author_id: 2 });

    const [a1, a2] = await em.find(Author, {});
    const [b1, b2] = await em.find(Book, {});

    // When we merge with autoDelete: false
    await em.merge(a1, [a2], { autoDelete: false });
    await em.flush();
    // Populate the books collection for the assertion
    await em.populate(a1, "books");
    // Then a1 should have both books
    expect(a1).toMatchEntity({ books: [b1, b2] });
    // But the source author should NOT be automatically deleted
    expect(await numberOf(em, Author, Book)).toEqual([2, 2]);
    // We can manually delete it
    em.delete(a2);
    await em.flush();
    expect(await numberOf(em, Author, Book)).toEqual([1, 2]);
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
