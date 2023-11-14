import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertImage,
  insertPublisher,
  insertTag,
} from "@src/entities/inserts";
import { lastQuery, newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";
import { Lens, getLens, getMetadata, testing } from "joist-orm";
import { Author, Book, Image, Publisher, Tag } from "./entities";

const { isAllSqlPaths } = testing;

describe("EntityManager.lens", () => {
  it("can navigate references", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const b1 = await em.load(Book, "1");
    const p1 = await b1.load((b) => b.author.publisher);
    expect(p1?.name).toEqual("p1");
    // @ts-expect-error
    expect(p1.name).toEqual("p1");
    expect(em.entities.length).toBe(3);
  });

  it("can navigate with n+1 safe queries", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    const em = newEntityManager();
    const [b1, b2] = await em.find(Book, {});
    resetQueryCount();
    const [p1, p2] = await Promise.all([b1, b2].map((book) => book.load((b) => b.author.publisher)));
    expect(p1?.name).toEqual("p1");
    expect(p2?.name).toEqual("p2");
    // 2 = 1 for authors, 1 for publishers
    expect(numberOfQueries).toEqual(2);
  });

  it("does not compile if lens is incorrect", async () => {
    // @ts-expect-error
    const f1 = (b: Lens<Book>) => b.author.foo;

    // @ts-expect-error
    const f2 = (b: Lens<Book>) => b.foo;
  });

  it("can navigate collections", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBook({ title: "b3", author_id: 2 });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    resetQueryCount();
    const authors = await p1.load((p) => p.authors);
    expect(authors.length).toEqual(2);
    const books: readonly Book[] = await p1.load((p) => p.authors.books);
    expect(books.length).toEqual(3);
    expect(numberOfQueries).toEqual(2);
  });

  it("can navigate collections then reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBook({ title: "b3", author_id: 2 });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    // This ends in a singular author (which is cyclic, but just b/c our test schema is small, it doesn't matter)
    const authors = await p1.load((p) => p.authors.books.author);
    expect(authors.length).toEqual(2);
  });

  it("can navigate nullable references", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const b1 = await em.load(Book, "1");
    const publisher = await b1.load((b) => b.author.publisher);
    expect(publisher).toBeUndefined();
  });

  it("can navigate collections then nullable references", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    // Kinda weird, but we include book reviews so that we can go through a plural collection
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertBookReview({ book_id: 2, rating: 1 });
    const em = newEntityManager();
    let publishers: Publisher[];
    // b1 --> author --> publisher finds 1 publisher
    const b1 = await em.load(Book, "1");
    publishers = await b1.load((b) => b.reviews.book.author.publisher);
    expect(publishers.length).toEqual(1);
    // b2 --> author --> publisher finds 0 publishers
    const b2 = await em.load(Book, "2");
    publishers = await b2.load((b) => b.reviews.book.author.publisher);
    expect(publishers).toEqual([]);
  });

  it("can navigate into async helper methods", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    const hasBooks: boolean[] = await p1.load((p) => p.authors.hasBooks);
    expect(hasBooks).toEqual([false]);
  });

  it("can navigate across undefined references", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const publisherName: string | undefined = await a1.load((a) => a.publisher.name);
    expect(publisherName).toEqual(undefined);
  });

  it("can navigate across undefined references from a list", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertTag({ name: "t1" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    const em = newEntityManager();
    const t1 = await em.load(Tag, "t:1");
    const publishers = await t1.load((t) => t.books.author.publisher);
    // Use `toStrictEqual` to ensure the list is not `[undefined]`
    expect(publishers).toStrictEqual([]);
    expect(getLens(t1, (t) => t.books.author.publisher)).toStrictEqual([]);
  });

  it("can navigate across soft-deleted references from an entity", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: new Date() });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const b1 = await em.load(Book, "b:1");
    const books = await b1.load((b) => b.author.books);
    expect(books).toMatchEntity([]);
    expect(getLens(b1, (b) => b.author.books)).toMatchEntity([]);
  });

  it("can navigate into getters", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const b1 = await em.load(Book, "1");
    const p1Id = await b1.load((b) => b.author.publisher.id);
    expect(p1Id).toEqual("p:1");
  });

  describe("sql", () => {
    it("loads a subset via o2o", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertImage({ file_name: "i1", type_id: 1, author_id: 1 });
      await insertImage({ file_name: "i2", type_id: 1, author_id: 2 });

      const em = newEntityManager();
      const b1 = await em.load(Book, "b:1");
      const i1 = await b1.load((b) => b.author.image, { sql: true });
      expect(i1!.fileName).toEqual("i1");
      expect(em.entities.length).toBe(2);

      expect(lastQuery()).toMatchInlineSnapshot(
        `"select "i".*, i.id as id, "b".id as __source_id from images as i inner join authors as a on a.id = i.author_id inner join books as b on b.author_id = a.id where a.deleted_at is null and b.deleted_at is null and b.id = any($1) order by i.id ASC limit $2"`,
      );
    });

    it("loads a subset via m2o that has a o2o as its otherField", async () => {
      await insertPublisher({ name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      await insertAuthor({ first_name: "a2", publisher_id: 2 });
      await insertImage({ file_name: "i1", type_id: 1, author_id: 1 });
      await insertImage({ file_name: "i2", type_id: 1, author_id: 2 });

      const em = newEntityManager();
      const i1 = await em.load(Image, "i:1");
      const p1 = await i1.load((i) => i.author.publisher, { sql: true });
      expect(p1!.name).toEqual("p1");
      expect(em.entities.length).toBe(2);

      expect(lastQuery()).toMatchInlineSnapshot(
        `"select "p".*, p_s0.*, p_s1.*, p.id as id, CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE 'Publisher' END as __class, "i".id as __source_id from publishers as p left outer join large_publishers as p_s0 on p.id = p_s0.id left outer join small_publishers as p_s1 on p.id = p_s1.id inner join authors as a on a.publisher_id = p.id inner join images as i on i.author_id = a.id where a.deleted_at is null and i.id = any($1) order by p.id ASC limit $2"`,
      );
    });

    it("loads a subset via m2o", async () => {
      await insertPublisher({ name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      await insertAuthor({ first_name: "a2", publisher_id: 2 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });

      const em = newEntityManager();
      const b1 = await em.load(Book, "b:1");
      const p1 = await b1.load((b) => b.author.publisher, { sql: true });
      expect(p1!.name).toEqual("p1");
      expect(em.entities.length).toBe(2);

      expect(lastQuery()).toMatchInlineSnapshot(
        `"select "p".*, p_s0.*, p_s1.*, p.id as id, CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE 'Publisher' END as __class, "b".id as __source_id from publishers as p left outer join large_publishers as p_s0 on p.id = p_s0.id left outer join small_publishers as p_s1 on p.id = p_s1.id inner join authors as a on a.publisher_id = p.id inner join books as b on b.author_id = a.id where a.deleted_at is null and b.deleted_at is null and b.id = any($1) order by p.id ASC limit $2"`,
      );
    });

    it("loads a subset via o2m", async () => {
      await insertPublisher({ name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      await insertAuthor({ first_name: "a2", publisher_id: 2 });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });

      const em = newEntityManager();
      const p1 = await em.load(Publisher, "p:1");
      const books = await p1.load((p) => p.authors.books, { sql: true });
      expect(books).toMatchEntity([{ title: "b1" }]);
      expect(em.entities.length).toBe(2);

      expect(lastQuery()).toMatchInlineSnapshot(
        `"select "b".*, b.id as id, "a".publisher_id as __source_id from books as b inner join authors as a on a.id = b.author_id where a.deleted_at is null and a.publisher_id = any($1) order by b.title ASC, b.id ASC limit $2"`,
      );
    });

    it("loads a subset via m2m last", async () => {
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 2, tag_id: 2 });

      const em = newEntityManager();
      const a1 = await em.load(Author, "a:1");
      const tags = await a1.load((a) => a.books.tags, { sql: true });
      expect(tags).toMatchEntity([{ name: "t1" }]);
      expect(em.entities.length).toBe(2);
    });

    it("loads a subset via m2m first", async () => {
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 2 });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 2, tag_id: 2 });

      const em = newEntityManager();
      const t1 = await em.load(Tag, "t:1");
      const authors = await t1.load((t) => t.books.author, { sql: true });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
      expect(em.entities.length).toBe(2);
    });

    it("has isAllSql", () => {
      expect(isAllSqlPaths(getMetadata(Book), ["author"])).toBe(true);
      expect(isAllSqlPaths(getMetadata(Book), ["author", "publisher"])).toBe(true);
      expect(isAllSqlPaths(getMetadata(Book), ["author", "numberOfBooks"])).toBe(false);
    });
  });
});
