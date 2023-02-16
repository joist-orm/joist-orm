import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertComment,
  insertImage,
  insertPublisher,
  update,
} from "@src/entities/inserts";
import {
  getMetadata,
  NotFoundError,
  parseEntityFilter,
  setDefaultEntityLimit,
  setEntityLimit,
  TooManyError,
} from "joist-orm";
import {
  Author,
  Book,
  BookReview,
  Color,
  Comment,
  Image,
  ImageType,
  Publisher,
  PublisherId,
  PublisherSize,
  SmallPublisher,
} from "./entities";
import { newEntityManager, numberOfQueries, resetQueryCount } from "./setupDbTests";

describe("EntityManager.queries", () => {
  it("can find all", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, {});
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("a1");
    expect(authors[1].firstName).toEqual("a2");
    expect(parseEntityFilter(getMetadata(Author), {})).toEqual({ kind: "join", subFilter: {} });
  });

  it("can find by simple varchar", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { firstName: "a2" });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
    expect(parseEntityFilter(getMetadata(Author), { firstName: "a2" })).toEqual({
      kind: "join",
      subFilter: { firstName: "a2" },
    });
  });

  it("can find by simple varchar is null", async () => {
    await insertAuthor({ first_name: "a1", last_name: "last_name" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { lastName: null });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
    expect(parseEntityFilter(getMetadata(Author), { lastName: null })).toEqual({
      kind: "join",
      subFilter: { lastName: null },
    });
  });

  it("cannot find by simple varchar is undefined", async () => {
    await insertAuthor({ first_name: "a1", last_name: "last_name" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { lastName: undefined });
    expect(authors.length).toEqual(2);
    expect(parseEntityFilter(getMetadata(Author), { lastName: undefined })).toEqual({
      kind: "join",
      subFilter: { lastName: undefined },
    });
  });

  it("can find by simple varchar not null", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { lastName: { ne: null } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a1");
    expect(parseEntityFilter(getMetadata(Author), { lastName: { ne: null } })).toEqual({
      kind: "join",
      subFilter: { lastName: { ne: null } },
    });
  });

  it("can find by simple varchar not undefined", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { lastName: { ne: undefined } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("can find by varchar through join", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBook({ title: "b3", author_id: 2 });

    const em = newEntityManager();
    const books = await em.find(Book, { author: { firstName: "a2" } });
    expect(books.length).toEqual(2);
    expect(books[0].title).toEqual("b2");
    expect(books[1].title).toEqual("b3");
  });

  it("can find by varchar through two joins", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });

    const em = newEntityManager();
    const books = await em.find(Book, { author: { publisher: { name: "p2" } } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find by foreign key", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });

    const em = newEntityManager();
    const a2 = await em.load(Author, "2");
    // This is different from the next test case b/c Publisher does not currently have any References
    const books = await em.find(Book, { author: a2 });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find by foreign key is null", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const authors = await em.find(Author, { publisher: null });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("cannot find by foreign key is undefined", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const authors = await em.find(Author, { publisher: undefined });
    expect(authors.length).toEqual(2);
  });

  it("can find by foreign key is new entity", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const publisher = new SmallPublisher(em, { name: "p1", city: "c1" });
    const authors = await em.find(Author, { publisher });
    expect(authors.length).toEqual(0);
  });

  it("can find by foreign key is not null", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const authors = await em.find(Author, { publisher: { ne: null } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is not undefined", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const authors = await em.find(Author, { publisher: { ne: undefined } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is flavor", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisherId: PublisherId = "1";
    const authors = await em.find(Author, { publisher: publisherId });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key id in list", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisherId: PublisherId = "1";
    const authors = await em.find(Author, { publisher: { id: { in: [publisherId] } } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is flavor list", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisherId: PublisherId = "1";
    const authors = await em.find(Author, { publisher: [publisherId] });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is entity list", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisher = await em.load(Publisher, "p:1");
    const authors = await em.find(Author, { publisher: [publisher] });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by foreign key is tagged flavor", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisherId: PublisherId = "p:1";
    const authors = await em.find(Author, { publisher: publisherId });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("fails find by foreign key is invalid tagged id", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisherId: PublisherId = "a:1";
    await expect(em.find(Author, { publisher: publisherId })).rejects.toThrow(
      "Invalid tagged id, expected tag p, got a:1",
    );
  });

  it("can find by foreign key is not flavor", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const publisherId: PublisherId = "1";
    // Technically id != 1 does not match the a1.publisher_id is null. Might fix this.
    const authors = await em.find(Author, { publisher: { ne: publisherId } });
    expect(authors.length).toEqual(0);
  });

  it("can find books by publisher", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });

    const em = newEntityManager();
    const publisher = await em.load(Publisher, "2");
    const books = await em.find(Book, { author: { publisher } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find through a o2o entity", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertImage({ book_id: 1, file_name: "1", type_id: 1 });
    await insertImage({ book_id: 2, file_name: "2", type_id: 1 });

    const em = newEntityManager();
    const image = await em.load(Image, "2");
    const books = await em.find(Book, { image });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find through a o2o filter", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertImage({ book_id: 1, file_name: "1", type_id: 1 });
    await insertImage({ author_id: 2, file_name: "2", type_id: 2 });

    const em = newEntityManager();
    const books = await em.find(Book, { image: { type: ImageType.BookImage } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b1");
  });

  it("can find by foreign key using only an id", async () => {
    await insertAuthor({ id: 3, first_name: "a1" });
    await insertAuthor({ id: 4, first_name: "a2" });
    await insertBook({ title: "b1", author_id: 3 });
    await insertBook({ title: "b2", author_id: 4 });

    const em = newEntityManager();
    const books = await em.find(Book, { author: { id: "4" } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find by foreign key using only a tagged id", async () => {
    await insertAuthor({ id: 3, first_name: "a1" });
    await insertAuthor({ id: 4, first_name: "a2" });
    await insertBook({ title: "b1", author_id: 3 });
    await insertBook({ title: "b2", author_id: 4 });

    const em = newEntityManager();
    const books = await em.find(Book, { author: { id: "a:4" } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find by foreign key using a tagged id list", async () => {
    await insertAuthor({ id: 3, first_name: "a1" });
    await insertAuthor({ id: 4, first_name: "a2" });
    await insertBook({ title: "b1", author_id: 3 });
    await insertBook({ title: "b2", author_id: 4 });

    const em = newEntityManager();
    const books = await em.find(Book, { author: { id: ["a:4"] } });
    expect(books.length).toEqual(1);
    expect(books[0].title).toEqual("b2");
  });

  it("can find by ids", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    const em = newEntityManager();
    const pubs = await em.find(Publisher, { id: ["1", "2"] });
    expect(pubs.length).toEqual(2);
  });

  it("can find by tagged ids", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    const em = newEntityManager();
    const pubs = await em.find(Publisher, { id: ["p:1", "p:2"] });
    expect(pubs.length).toEqual(2);
  });

  it("can find by ids with in clause", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    const em = newEntityManager();
    const pubs = await em.find(Publisher, { id: { in: ["1", "2"] } });
    expect(pubs.length).toEqual(2);
  });

  it("can find by enums", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    await insertPublisher({ id: 2, name: "p2", size_id: 2 });
    const em = newEntityManager();
    const pubs = await em.find(Publisher, { size: PublisherSize.Large });
    expect(pubs.length).toEqual(1);
    expect(pubs[0].name).toEqual("p2");
  });

  it("can find by not equal enum", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    await insertPublisher({ id: 2, name: "p2", size_id: 2 });
    const em = newEntityManager();
    const pubs = await em.find(Publisher, { size: { ne: PublisherSize.Large } });
    expect(pubs.length).toEqual(1);
    expect(pubs[0].name).toEqual("p1");
  });

  it("can find by simple integer", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: 2 });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by integer with eq", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { eq: 2 } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by integer with in", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { in: [1, 2] } });
    expect(authors.length).toEqual(2);
  });

  it("can find by integer with null", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { eq: null } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by integer with non-op null", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: null, firstName: undefined });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by greater than", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { gt: 1 } });
    expect(authors).toHaveLength(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by greater than or equal to", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { gte: 2 } });
    expect(authors).toHaveLength(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by less than", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { lt: 2 } });
    expect(authors).toHaveLength(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("can find by less than or equal to", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { lte: 1 } });
    expect(authors).toHaveLength(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("can find by less than or equal to and greater than or equal to simultaneously", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    await insertAuthor({ first_name: "a3", age: 3 });
    await insertAuthor({ first_name: "a4", age: 4 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { gte: 2, lte: 3 } });
    expect(authors).toHaveLength(2);
    expect(authors[0].firstName).toEqual("a2");
    expect(authors[1].firstName).toEqual("a3");
  });

  it("can find by not equal", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { age: { ne: 1 } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find by like", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { firstName: { like: "a%" } });
    expect(authors.length).toEqual(2);
  });

  it("can find by ilike", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, { firstName: { ilike: "A%" } });
    expect(authors.length).toEqual(2);
  });

  it("can find by like and join with not equal enum", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    await insertPublisher({ id: 2, name: "p2", size_id: 2 });
    await insertAuthor({ first_name: "a", publisher_id: 1 });
    await insertAuthor({ first_name: "a", publisher_id: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, {
      firstName: "a",
      publisher: {
        size: { ne: PublisherSize.Large },
      },
    });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a");
  });

  it("can find by one", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    const em = newEntityManager();
    const publisher = await em.findOne(Publisher, { name: "p2" });
    expect(publisher).toBeUndefined();
  });

  it("can find by one or fail", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    await insertPublisher({ id: 2, name: "p2", size_id: 2 });
    const em = newEntityManager();
    const publisher = await em.findOneOrFail(Publisher, { name: "p2" });
    expect(publisher.name).toEqual("p2");
  });

  it("can find by one when not found", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    await insertPublisher({ id: 2, name: "p2", size_id: 2 });
    const em = newEntityManager();
    await expect(em.findOneOrFail(Publisher, { name: "p3" })).rejects.toThrow(NotFoundError);
    await expect(em.findOneOrFail(Publisher, { name: "p3" })).rejects.toThrow("Did not find Publisher for given query");
  });

  it("can find by one when too many found", async () => {
    await insertPublisher({ name: "p", size_id: 1 });
    await insertPublisher({ id: 2, name: "p", size_id: 2 });
    const em = newEntityManager();
    await expect(em.findOneOrFail(Publisher, { name: "p" })).rejects.toThrow(TooManyError);
    await expect(em.findOneOrFail(Publisher, { name: "p" })).rejects.toThrow(
      "Found more than one: SmallPublisher:1, SmallPublisher:2",
    );
  });

  it("can order by string asc", async () => {
    await insertAuthor({ first_name: "a2" });
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const authors = await em.find(Author, {}, { orderBy: { firstName: "ASC" } });
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("a1");
    expect(authors[1].firstName).toEqual("a2");
  });

  it("can order by string desc", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.find(Author, {}, { orderBy: { firstName: "DESC" } });
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("a2");
    expect(authors[1].firstName).toEqual("a1");
  });

  it("can order by joined string asc", async () => {
    await insertPublisher({ name: "pB" });
    await insertPublisher({ id: 2, name: "pA" });
    await insertAuthor({ first_name: "aB", publisher_id: 1 });
    await insertAuthor({ first_name: "aA", publisher_id: 2 });
    const em = newEntityManager();
    const authors = await em.find(Author, {}, { orderBy: { publisher: { name: "ASC" } } });
    expect(authors.length).toEqual(2);
    expect(authors[0].firstName).toEqual("aA");
    expect(authors[1].firstName).toEqual("aB");
  });

  it("can find empty results in a loop", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    resetQueryCount();
    await Promise.all(
      ["a", "b"].map(async (lastName) => {
        const authors = await em.find(Author, { lastName });
        expect(authors.length).toEqual(0);
      }),
    );
    expect(numberOfQueries).toEqual(1);
  });

  it("can find with GQL filters", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const gqlFilter: GraphQLAuthorFilter = {
      age: { eq: 2 },
    };
    const authors = await em.findGql(Author, gqlFilter);
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can findGql by foreign key is not null", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 2, first_name: "a1" });
    await insertAuthor({ id: 3, first_name: "a2", publisher_id: 1 });
    const em = newEntityManager();
    const authors = await em.findGql(Author, { publisher: { ne: null } });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find with GQL filters but still use hash declaration", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const age = 2;
    // The { age } syntax still works i.e. for massaging arguments to findGql in TS
    const authors = await em.findGql(Author, { age });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find with GQL filters on booleans", async () => {
    await insertAuthor({ first_name: "a1", is_popular: false });
    await insertAuthor({ first_name: "a2", is_popular: true });
    const em = newEntityManager();
    const gqlFilter: GraphQLAuthorFilter = {
      isPopular: true,
    };
    const authors = await em.findGql(Author, gqlFilter);
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can find with GQL filters with enums", async () => {
    await insertPublisher({ name: "p1", size_id: 1 });
    const em = newEntityManager();
    const gqlFilter: GraphQLPublisherFilter = { size: [PublisherSize.Small] };
    const publishers = await em.findGql(Publisher, gqlFilter);
    expect(publishers.length).toEqual(1);
  });

  it("can find with GQL by greater than with op/value", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const authors = await em.findGql(Author, { age: { op: "gt", value: 1 } });
    expect(authors.length).toEqual(1);
  });

  it("can find with GQL filters with offset/limit", async () => {
    await insertAuthor({ first_name: "a1", age: 1 });
    await insertAuthor({ first_name: "a2", age: 2 });
    const em = newEntityManager();
    const gqlFilter: GraphQLAuthorFilter = { age: { gt: 0 } };
    const authors = await em.findGql(Author, gqlFilter, { offset: 1, limit: 1 });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("a2");
  });

  it("can offset/limit", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertPublisher({ id: 3, name: "p3" });
    await insertPublisher({ id: 4, name: "p4" });
    const em = newEntityManager();
    const p23 = await em.find(Publisher, {}, { orderBy: { name: "ASC" }, offset: 1, limit: 2 });
    expect(p23.length).toEqual(2);
    expect(p23[0].name).toEqual("p2");
    expect(p23[1].name).toEqual("p3");

    const p43 = await em.find(Publisher, {}, { orderBy: { name: "DESC" }, offset: 2, limit: 2 });
    expect(p43.length).toEqual(2);
    expect(p43[0].name).toEqual("p2");
    expect(p43[1].name).toEqual("p1");
  });

  it("cannot find too many entities", async () => {
    try {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a3" });

      setEntityLimit(3);
      const em = newEntityManager();
      await expect(em.find(Author, {})).rejects.toThrow("Query returned more than 3 rows");
    } finally {
      setDefaultEntityLimit();
    }
  });

  it("can find in an enum array", async () => {
    await insertAuthor({ first_name: "a1", favorite_colors: [1, 2] });
    await insertAuthor({ first_name: "a2", favorite_colors: [] });
    const em = newEntityManager();
    const authors = await em.find(Author, { favoriteColors: [Color.Red] });
    expect(authors.length).toEqual(1);
  });

  it("can find equal an enum array", async () => {
    await insertAuthor({ first_name: "a1", favorite_colors: [1, 2] });
    await insertAuthor({ first_name: "a2", favorite_colors: [1] });
    const em = newEntityManager();
    const authors = await em.find(Author, { favoriteColors: { eq: [Color.Red] } });
    expect(authors.length).toEqual(1);
  });

  it("can find through a polymorphic reference by id", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2" });

    const em = newEntityManager();
    const comments = await em.find(Comment, { parent: "b:1" });
    const [comment] = comments;
    expect(comments.length).toEqual(1);
    expect(comment.text).toEqual("t1");
  });

  it("can find through a polymorphic reference by entity", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2" });

    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const comments = await em.find(Comment, { parent: book });
    const [comment] = comments;
    expect(comments.length).toEqual(1);
    expect(comment.text).toEqual("t1");
  });

  it("can find through a null polymorphic reference", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2" });

    const em = newEntityManager();
    const comments = await em.find(Comment, { parent: null });
    const [comment] = comments;
    expect(comments.length).toEqual(1);
    expect(comment.text).toEqual("t2");
  });

  it("can find through polymorphic reference by array of ids/entities", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 5 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2", parent_book_review_id: 1 });
    await insertComment({ text: "t3" });

    const em = newEntityManager();
    const comments = await em.find(Comment, { parent: ["b:1", "br:1"] });
    const [c1, c2] = comments;
    expect(comments.length).toEqual(2);
    expect(c1.text).toEqual("t1");
    expect(c2.text).toEqual("t2");
  });

  it("can find through polymorphic reference by not id", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2" });

    const em = newEntityManager();
    const comments = await em.find(Comment, { parent: { ne: "b:1" } });
    const [comment] = comments;
    expect(comments.length).toEqual(1);
    expect(comment.text).toEqual("t2");
  });

  it("can find through o2m to a polymorphic reference", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertComment({ text: "t1", parent_book_id: 1 });
    await insertComment({ text: "t2", parent_book_id: 1 });
    await insertComment({ text: "t3" });

    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const comments = await book.comments.load();
    expect(comments.length).toEqual(2);
    expect(comments.map((c) => c.text)).toEqual(["t1", "t2"]);
  });

  it("can find through o2o to a polymorphic reference", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 1, book_id: 1 });
    await insertComment({ text: "t1", parent_book_review_id: 1 });

    const em = newEntityManager();
    const review = await em.load(BookReview, "1");
    const comment = await review.comment.load();
    expect(comment).toBeTruthy();
    expect(comment!.text).toEqual("t1");
  });

  it("can have the same table twice in the query", async () => {
    await insertAuthor({ first_name: "a" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await update("authors", { id: 1, current_draft_book_id: 1 });

    const em = newEntityManager();
    const book = await em.findOneOrFail(Book, { title: "b2", author: { currentDraftBook: { title: "b1" } } });
    expect(book.title).toBe("b2");
  });
});

/** Example AuthorFilter generated by graphql-code-generator. */
interface GraphQLAuthorFilter {
  age?: GraphQLIntFilter | null | undefined;
  isPopular?: boolean | null | undefined;
}

/** Example IntFilter generated by graphql-code-generator. */
interface GraphQLIntFilter {
  eq?: number | null | undefined;
  in?: number[] | null | undefined;
  lte?: number | null | undefined;
  lt?: number | null | undefined;
  gte?: number | null | undefined;
  gt?: number | null | undefined;
  ne?: number | null | undefined;
}

/** Example PublisherFilter generated by graphql-code-generator. */
interface GraphQLPublisherFilter {
  size?: PublisherSize[] | null | undefined;
}
