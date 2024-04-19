import { Author, AuthorId, BookId, FavoriteShape, newAuthor, PublisherId } from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { expectTypeOf } from "expect-type";
import { toJSON } from "joist-orm";
import { insertAuthor, insertBook, insertPublisher, insertPublisherGroup } from "src/entities/inserts";

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
    const payload = await toJSON(a, ["id", "firstName", "favoriteShape"]);
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

  describe("m2o", () => {
    it("can be just the id", async () => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint of just the publisher key
      const payload = await toJSON(a, ["publisher"]);
      // Then we output only the id
      expect(payload).toEqual({ publisher: "p:1" });
      expectTypeOf(payload).toEqualTypeOf<{ publisher: string }>();
    });

    it("can nest the id and name", async () => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the publisher
      const payload = await toJSON(a, { publisher: ["id", "name"] });
      type T = typeof payload;
      // Then we output the nested keys
      expect(payload).toEqual({ publisher: { id: "p:1", name: "p1" } });
      // ...why does toExpectTypeOf not work here?
      expectTypeOf(payload).toMatchTypeOf<{ publisher: { id: PublisherId; name: string } }>();
    });

    it("can nest multiple levels", async () => {
      await insertPublisherGroup({ name: "pg1" });
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
      await insertPublisherGroup({ name: "pg1" });
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
});
