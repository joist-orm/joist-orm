import { expectTypeOf } from "expect-type";
import { toJSON } from "joist-orm";
import { Author, type AuthorId, type BookId, FavoriteShape, type PublisherId, newAuthor } from "src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertImage,
  insertPublisher,
  insertSmallPublisherGroup,
  insertTag,
} from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("Entity.json", () => {
  it("can toJSON a primitive", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const payload = await toJSON(a, "firstName");
    expect(payload).toEqual({ firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }>();
  });

  it("can toJSON multiple primitives", async () => {
    // Given a persisted author
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When the author's id, name, and favorite shape are requested
    const payload = await a.toJSON(["id", "firstName", "favoriteShape"]);
    // Then only the requested author fields are returned
    expect(payload).toEqual({
      id: "a:1",
      firstName: "a1",
      favoriteShape: undefined,
    });
    expectTypeOf(payload).toEqualTypeOf<{
      id: AuthorId | null;
      firstName: string;
      favoriteShape: FavoriteShape | undefined;
    }>();
  });

  it("support misc types", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    const payload = await a.toJSON({
      reviews: "rating", // hasManyThrough
      latestComment: "text", // hasOneDerived
      numberOfPublicReviews: {}, // ReactiveField
      initials: {}, // getter
      favoriteBook: "title", // ReactiveReference
      numberOfBooks2: {}, // hasReactiveProperty
      hasLowerCaseFirstName: {}, // ReactiveGetter
    });
    expect(payload).toEqual({
      favoriteBook: undefined,
      hasLowerCaseFirstName: true,
      initials: "a",
      latestComment: undefined,
      numberOfBooks2: 0,
      numberOfPublicReviews: 0,
      reviews: [],
    });
    expectTypeOf(payload).toMatchTypeOf<{
      initials: string;
      numberOfBooks2: number;
      numberOfPublicReviews: number;
      favoriteBook: { title: string } | undefined;
      hasLowerCaseFirstName: boolean;
      latestComment: { text: string | undefined } | undefined;
      reviews: { rating: number }[];
    }>();
  });

  describe("m2o", () => {
    it("can be just the id", async () => {
      // Given a persisted author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When only the publisher is requested without nested fields
      const payload = await a.toJSON(["publisher"]);
      // Then we output only the id
      expect(payload).toEqual({ publisher: "p:1" });
      expectTypeOf(payload).toEqualTypeOf<{ publisher: string | null }>();
    });

    it("can be just the id suffixed", async () => {
      // Given a persisted author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the author id and publisher id are requested
      const payload = await a.toJSON({ id: {}, publisherId: {} });
      // Then we output only the id
      expect(payload).toEqual({ id: "a:1", publisherId: "p:1" });
      expectTypeOf(payload).toMatchTypeOf<{ id: AuthorId | null; publisherId: string | null }>();
    });

    it("can nest the id and name", async () => {
      // Given a persisted author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the publisher's id and name are requested
      const payload = await toJSON(a, { publisher: ["id", "name"] });
      // Then we output the nested keys
      expect(payload).toEqual({ publisher: { id: "p:1", name: "p1" } });
      // ...why does toExpectTypeOf not work here?
      expectTypeOf(payload).toMatchTypeOf<{ publisher: { id: PublisherId | null; name: string } }>();
    });

    it("can nest multiple levels", async () => {
      await insertSmallPublisherGroup({ id: 1, name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given two levels of nesting
      const payload = await toJSON(a, {
        publisher: { name: {}, group: "name" },
      });
      // Then we output the publisher child + group grandchild
      expect(payload).toEqual({
        publisher: {
          name: "p1",
          group: { name: "pg1" },
        },
      });
      // And it's typed correctly
      expectTypeOf(payload).toMatchTypeOf<{
        publisher: {
          name: string;
          group: { name: string | undefined };
        };
      }>();
    });

    it("can have custom names", async () => {
      // Given an author whose publisher belongs to a named group
      await insertSmallPublisherGroup({ id: 1, name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the group name is requested as a custom publisher field
      const payload = await toJSON(a, {
        publisher: {
          id: {},
          // The custom field loads the publisher's group to obtain its name.
          groupName: async (p) => {
            // ...and this code is kind of gross...
            return (await p.populate("group")).group.get?.name;
          },
        },
      });
      // Then we output the custom key
      expect(payload).toEqual({
        publisher: { id: "p:1", groupName: "pg1" },
      });
      expectTypeOf(payload).toMatchTypeOf<{
        publisher: { id: PublisherId | null; groupName: string | undefined };
      }>();
    });
  });

  describe("o2m", () => {
    it("can be just the ids", async () => {
      // Given an author with two persisted books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When books are requested without nested fields
      const payload = await toJSON(a, "books");
      // Then we output the nested keys
      expect(payload).toEqual({
        books: ["b:1", "b:2"],
      });
      expectTypeOf(payload).toMatchTypeOf<{ books: (string | null)[] }>();
    });

    it("can be just the ids suffixes", async () => {
      // Given an author with two persisted books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When book ids are requested
      const payload = await a.toJSON({ bookIds: true });
      // Then we output the nested keys
      expect(payload).toEqual({ bookIds: ["b:1", "b:2"] });
      expectTypeOf(payload).toMatchTypeOf<{ bookIds: (BookId | null)[] }>();
    });

    it("can nest the id and name", async () => {
      // Given an author with two persisted books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When book ids and titles are requested
      const payload = await toJSON(a, { books: ["id", "title"] });
      // Then we output the nested keys
      expect(payload).toEqual({
        books: [
          { id: "b:1", title: "b1" },
          { id: "b:2", title: "b2" },
        ],
      });
      expectTypeOf(payload).toMatchTypeOf<{ books: { id: BookId | null; title: string }[] }>();
    });
  });

  describe("m2m", () => {
    it("can be just the ids", async () => {
      // Given an author with two persisted tags
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When tags are requested without nested fields
      const payload = await toJSON(a, "tags");
      // Then we output the nested keys
      expect(payload).toEqual({
        tags: ["t:1", "t:2"],
      });
      expectTypeOf(payload).toMatchTypeOf<{ tags: (string | null)[] }>();
    });

    it("can nest the id and name", async () => {
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the tags
      const payload = await toJSON(a, { tags: "name" });
      // Then we output the nested keys
      expect(payload).toEqual({
        tags: [{ name: "t1" }, { name: "t2" }],
      });
      expectTypeOf(payload).toMatchTypeOf<{ tags: { name: string }[] }>();
    });
  });

  describe("o2o", () => {
    it("can be just the ids", async () => {
      // Given an author with a persisted image
      await insertAuthor({ first_name: "a1" });
      await insertImage({ type_id: 1, file_name: "f1", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the image is requested without nested fields
      const payload = await toJSON(a, "image");
      // Then only the image id is returned
      expect(payload).toEqual({ image: "i:1" });
      expectTypeOf(payload).toMatchTypeOf<{ image: string | null }>();
    });

    it("can nest the id and name", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertImage({ type_id: 1, file_name: "f1", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      const payload = await toJSON(a, { image: "fileName" });
      expect(payload).toEqual({ image: { fileName: "f1" } });
      expectTypeOf(payload).toMatchTypeOf<{ image: { fileName: string } }>();
    });
  });

  it("works on lists", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    const payload = await toJSON([a1, a2], "firstName");
    expect(payload).toEqual([{ firstName: "a1" }, { firstName: "a2" }]);
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }[]>();
  });

  it("is available as a toJSON overload", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const payload = await a1.toJSON(["firstName"]);
    expect(payload).toEqual({ firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }>();
  });

  it("is not broken by JSON.stringify", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    expect(JSON.stringify([a1, a2])).toBe(`[{"id":null},{"id":null}]`);
  });

  it("can use true to enable fields", async () => {
    // Given an author with two persisted books
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    // When the name and books are enabled without nested fields
    const payload = await a.toJSON({ firstName: true, books: true });
    // Then the name and book ids are returned
    expect(payload).toEqual({ firstName: "a1", books: ["b:1", "b:2"] });
    expectTypeOf(payload).toMatchTypeOf<{ firstName: string; books: (BookId | null)[] }>();
  });

  it("keeps the no-hint default limited to the id", async () => {
    // Given a persisted author with a name
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When no fields are explicitly requested
    const payload = a.toJSON();
    // Then the name is not exposed
    expect(payload).toEqual({ id: "a:1" });
  });

  it("can include Date fields", async () => {
    // Given a persisted author with a creation timestamp
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When the creation timestamp is requested
    const payload = await toJSON(a, { createdAt: true });
    // Then the Date is preserved for JSON.stringify to encode
    expect(payload).toEqual({ createdAt: a.createdAt });
    expectTypeOf(payload).toEqualTypeOf<{ createdAt: Date }>();
  });

  it("encodes Date fields as ISO strings in JSON", async () => {
    // Given a persisted author with a creation timestamp
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When a hinted timestamp is encoded as JSON
    const json = JSON.stringify(await a.toJSON({ createdAt: true }));
    // Then the timestamp uses the standard Date JSON representation
    expect(json).toEqual(JSON.stringify({ createdAt: a.createdAt.toISOString() }));
  });

  it("uses null for the id of an unflushed author", async () => {
    // Given an author that has not been flushed
    const em = newEntityManager();
    const a = newAuthor(em);
    // When its id and name are requested
    const payload = await toJSON(a, ["id", "firstName"]);
    // Then the missing id does not prevent the name from being serialized
    expect(payload).toEqual({ id: null, firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ id: AuthorId | null; firstName: string }>();
  });

  it("uses null for an unflushed reference id", async () => {
    // Given an author with a new publisher
    const em = newEntityManager();
    const a = newAuthor(em, { publisher: {} });
    // When only the publisher id is requested
    const payload = await a.toJSON({ publisherId: true });
    // Then the publisher's missing id is represented as null
    expect(payload).toEqual({ publisherId: null });
    expectTypeOf(payload).toEqualTypeOf<{ publisherId: string | null }>();
  });

  it("uses null for unflushed collection ids", async () => {
    // Given an author with a new book
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{}] });
    // When only the book ids are requested
    const payload = await a.toJSON({ bookIds: true });
    // Then the book's missing id is represented as null
    expect(payload).toEqual({ bookIds: [null] });
    expectTypeOf(payload).toEqualTypeOf<{ bookIds: (BookId | null)[] }>();
  });

  it("can include ids in nested unflushed entities", async () => {
    // Given an author with a new book
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{ title: "New book" }] });
    // When book ids and titles are requested together
    const payload = await a.toJSON({ books: ["id", "title"] });
    // Then the missing id does not prevent nested serialization
    expect(payload).toEqual({ books: [{ id: null, title: "New book" }] });
    expectTypeOf(payload).toEqualTypeOf<{ books: { id: BookId | null; title: string }[] }>();
  });
});
