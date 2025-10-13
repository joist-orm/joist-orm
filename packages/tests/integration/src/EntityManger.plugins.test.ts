import { getMetadata, Plugin } from "joist-orm";
import { ImmutableEntitiesPlugin } from "joist-orm/build/plugins/ImmutableEntitiesPlugin";
import { describe } from "node:test";
import { Author, Image, newAuthor } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { twoOf } from "src/utils";

describe("EntityManger.plugins", () => {
  describe("ImmutableEntitiesPlugin", () => {
    it.withCtx("prevents writes to immutable entities", async (ctx) => {
      const { em } = ctx;
      const plugin = new ImmutableEntitiesPlugin();
      em.addPlugin(plugin);
      const [a1, a2] = twoOf((i) => newAuthor(em, { firstName: `a${i + 1}` }));
      plugin.addEntity(a2);
      expect(() => (a2.firstName = "changed")).toThrow("Cannot set field firstName on immutable entity Author#2");
      expect(() => (a1.firstName = "changed")).not.toThrow();
    });
  });

  describe("beforeSetField", () => {
    class BeforeSetFieldPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["beforeSetField"]>[] = [];
      originalValue: any[] = [];

      beforeSetField(...args: Parameters<Required<Plugin>["beforeSetField"]>) {
        const [entity, field] = args;
        this.calls.push(args);
        this.originalValue.push(entity[field as keyof typeof entity]);
      }
    }

    it.withCtx("is called before an entity's field is set", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      // use Image because it doesn't have any defaults that would call setField multiple times on create
      const image = em.createPartial(Image, { fileName: "original name" });
      expect(plugin.calls).toHaveLength(1);
      expect(plugin.calls[0]).toEqual([image, "fileName", "original name"]);
      expect(plugin.originalValue[0]).toEqual(undefined);
      image.fileName = "new name";
      expect(plugin.calls).toHaveLength(2);
      expect(plugin.calls[1]).toEqual([image, "fileName", "new name"]);
      expect(plugin.originalValue[1]).toEqual("original name");
    });

    it.withCtx("is not called when the value of a field stays the same", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      const image = em.createPartial(Image, { fileName: "original name" });
      em.addPlugin(plugin);
      image.fileName = "original name";
      expect(plugin.calls).toHaveLength(0);
    });

    it.withCtx("is called when the value of a field is reverted to its original value", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      const image = em.createPartial(Image, { fileName: "original name" });
      em.addPlugin(plugin);
      image.fileName = "new name";
      expect(plugin.calls).toHaveLength(1);
      expect(plugin.calls[0]).toEqual([image, "fileName", "new name"]);
      expect(plugin.originalValue[0]).toEqual("original name");
      image.fileName = "original name";
      expect(plugin.calls).toHaveLength(2);
      expect(plugin.calls[1]).toEqual([image, "fileName", "original name"]);
      expect(plugin.originalValue[1]).toEqual("new name");
    });
  });

  describe("beforeFind", () => {
    class BeforeFindPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["beforeFind"]>[] = [];

      beforeFind(...args: Parameters<Required<Plugin>["beforeFind"]>) {
        this.calls.push(args);
      }
    }

    it.withCtx("is called with the meta, operation and query on find", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      await em.find(Author, {});
      expect(plugin.calls).toEqual([[getMetadata(Author), "find", expect.objectContaining({}), {}]]);
    });

    // TODO: do we want to test every operation here?
  });

  describe("afterFind", () => {
    class AfterFindPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["afterFind"]>[] = [];

      afterFind(...args: Parameters<Required<Plugin>["afterFind"]>) {
        this.calls.push(args);
      }
    }

    it.withCtx("is called with the meta, operation and returned rows on find", async (ctx) => {
      await insertAuthor({ first_name: "a1" });
      const { em } = ctx;
      const plugin = new AfterFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      await em.find(Author, {});
      expect(plugin.calls).toEqual([[getMetadata(Author), "find", [expect.objectContaining({})]]]);
    });

    // TODO: do we want to test every operation here?
  });
});
