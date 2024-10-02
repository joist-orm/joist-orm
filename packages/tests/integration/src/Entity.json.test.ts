import { Author, AuthorId, BookId, FavoriteShape, ImageId, newAuthor, PublisherId } from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { expectTypeOf } from "expect-type";
import { toJSON } from "joist-orm";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertImage,
  insertPublisher,
  insertSmallPublisherGroup,
  insertTag,
} from "src/entities/inserts";

describe("Entity.json", () => {
  it("can toJSON a primitive", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const payload = await toJSON(a, "firstName");
    expect(payload).toEqual({ firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }>();
  });

  it("can toJSON multiple primitives", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    const payload = await a.toJSON(["id", "firstName", "favoriteShape"]);
    expect(payload).toEqual({
      id: "a:1",
      firstName: "a1",
      favoriteShape: undefined,
    });
    expectTypeOf(payload).toEqualTypeOf<{
      id: AuthorId;
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
      numberOfBooks2: {}, // hasReactiveAsyncProperty
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
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint of just the publisher key
      const payload = await a.toJSON(["publisher"]);
      // Then we output only the id
      expect(payload).toEqual({ publisher: "p:1" });
      expectTypeOf(payload).toEqualTypeOf<{ publisher: string }>();
    });

    it("can be just the id suffixed", async () => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint of just the publisher key
      const payload = await a.toJSON({ id: {}, publisherId: {} });
      // Then we output only the id
      expect(payload).toEqual({ id: "a:1", publisherId: "p:1" });
      expectTypeOf(payload).toMatchTypeOf<{ id: AuthorId; publisherId: PublisherId }>();
    });

    it("can nest the id and name", async () => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the publisher
      const payload = await toJSON(a, { publisher: ["id", "name"] });
      // Then we output the nested keys
      expect(payload).toEqual({ publisher: { id: "p:1", name: "p1" } });
      // ...why does toExpectTypeOf not work here?
      expectTypeOf(payload).toMatchTypeOf<{ publisher: { id: PublisherId; name: string } }>();
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
      await insertSmallPublisherGroup({ id: 1, name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that has a `groupName` key that is not actually a property on the entity
      const payload = await toJSON(a, {
        publisher: {
          id: {},
          // And it's an async lambda that accepts the entity
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
        publisher: { id: PublisherId; groupName: string | undefined };
      }>();
    });
  });

  describe("o2m", () => {
    it("can be just the ids", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the publisher
      const payload = await toJSON(a, "books");
      // Then we output the nested keys
      expect(payload).toEqual({
        books: ["b:1", "b:2"],
      });
      expectTypeOf(payload).toMatchTypeOf<{ books: string[] }>();
    });

    it("can be just the ids suffixes", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the publisher
      const payload = await a.toJSON({ bookIds: true });
      // Then we output the nested keys
      expect(payload).toEqual({ bookIds: ["b:1", "b:2"] });
      expectTypeOf(payload).toMatchTypeOf<{ bookIds: BookId[] }>();
    });

    it("can nest the id and name", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the publisher
      const payload = await toJSON(a, { books: ["id", "title"] });
      // Then we output the nested keys
      expect(payload).toEqual({
        books: [
          { id: "b:1", title: "b1" },
          { id: "b:2", title: "b2" },
        ],
      });
      expectTypeOf(payload).toMatchTypeOf<{ books: { id: BookId; title: string }[] }>();
    });
  });

  describe("m2m", () => {
    it("can be just the ids", async () => {
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the tags
      const payload = await toJSON(a, "tags");
      // Then we output the nested keys
      expect(payload).toEqual({
        tags: ["t:1", "t:2"],
      });
      expectTypeOf(payload).toMatchTypeOf<{ tags: string[] }>();
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
      await insertAuthor({ first_name: "a1" });
      await insertImage({ type_id: 1, file_name: "f1", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      const payload = await toJSON(a, "image");
      expect(payload).toEqual({ image: "i:1" });
      expectTypeOf(payload).toMatchTypeOf<{ image: ImageId }>();
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
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    const payload = await a.toJSON({ firstName: true, books: true });
    expect(payload).toEqual({ firstName: "a1", books: ["b:1", "b:2"] });
    expectTypeOf(payload).toMatchTypeOf<{ firstName: string; books: BookId[] }>();
  });
});
