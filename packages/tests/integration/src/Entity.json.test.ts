import { Author, newAuthor } from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { toJSON } from "joist-orm";
import { insertAuthor, insertPublisher, insertPublisherGroup } from "src/entities/inserts";

describe("Entity.json", () => {
  it("can toJSON a primitive", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    expect(await toJSON(a, "firstName")).toEqual({ firstName: "a1" });
  });

  it("can toJSON multiple primitives", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    expect(await toJSON(a, ["id", "firstName", "favoriteShape"])).toEqual({
      id: "a:1",
      firstName: "a1",
      favoriteShape: undefined,
    });
  });

  describe("m2o", () => {
    it("can be just the id", async () => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint of just the publisher key
      expect(await toJSON(a, ["publisher"])).toEqual({
        // Then we output only the id
        publisher: "p:1",
      });
    });

    it("can nest the id and name", async () => {
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the publisher
      expect(await toJSON(a, { publisher: ["id", "name"] })).toEqual({
        // Then we output the nested keys
        publisher: { id: "p:1", name: "p1" },
      });
    });

    it("can nest multiple levels", async () => {
      await insertPublisherGroup({ name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given two levels of nesting
      expect(await toJSON(a, { publisher: { name: {}, group: "name" } })).toEqual({
        // Then we output the publisher child + group grandchild
        publisher: {
          name: "p1",
          group: { name: "pg1" },
        },
      });
    });

    it("can have custom names", async () => {
      await insertPublisherGroup({ name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(
        await toJSON(a, {
          // Given a hint that has a `groupName` key that is not actually
          // a property on the entity
          publisher: {
            id: {},
            // And it's an async lambda that accepts the entity
            groupName: async (p) => {
              // ...and this code is kind of gross...
              return (await p.populate("group")).group.get?.name;
            },
          },
        }),
      ).toEqual({
        // Then we output the custom key
        publisher: {
          id: "p:1",
          groupName: "pg1",
        },
      });
    });
  });

  describe.skip("o2m", () => {
    it("can be just the ids", async () => {});

    it("can nest the id and name", async () => {});
  });
});
