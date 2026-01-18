import { getMetadata, ImmutableEntitiesPlugin, Plugin } from "joist-orm";
import { Author, Book, Image, newAuthor, newBook, newImage } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { isPreloadingEnabled, newEntityManager } from "src/testEm";
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

    it("does not throw when setField is called via reactions that don't change", async () => {
      const [em, em2] = twoOf(() => newEntityManager());
      newAuthor(em, { firstName: `a1` });
      await em.flush();
      const plugin = new ImmutableEntitiesPlugin();
      em2.addPlugin(plugin);
      const author = await em2.load(Author, "a:1");
      plugin.addEntity(author);
      // This .load should call setField internally, but it shouldn't throw because beforeSetField isn't called.
      // Unfortunately, I'm not sure if there's a way to assert that `setField` is actually called here
      await expect(() => author.search.load()).resolves.not.toThrow();
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

    it.withCtx("is called when setting a m2o relation", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      const a1 = newAuthor(em);
      const a2 = newAuthor(em);
      const b1 = newBook(em, { author: a1 });
      em.addPlugin(plugin);
      b1.author.set(a2);
      expect(plugin.calls).toMatchEntity([[b1, "author", a2]]);
    });
  });

  describe("beforeGetField", () => {
    class BeforeGetFieldPlugin extends Plugin {
      calls: Parameters<Required<Plugin>["beforeGetField"]>[] = [];

      beforeGetField(...args: Parameters<Required<Plugin>["beforeGetField"]>) {
        this.calls.push(args);
      }
    }

    it.withCtx("is called before an entity's field is retrieved", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      const image = newImage(em);
      em.addPlugin(plugin);
      expect(plugin.calls).toHaveLength(0);
      const _ = image.fileName;
      expect(plugin.calls).toEqual([[image, "fileName"]]);
    });

    it.withCtx("is called each time a field is accessed", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      const image = newImage(em);
      em.addPlugin(plugin);
      const _ = image.fileName;
      const _2 = image.fileName;
      expect(plugin.calls).toEqual([
        [image, "fileName"],
        [image, "fileName"],
      ]);
    });

    it.withCtx("is called when accessing a m2o relation", async (ctx) => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const { em } = ctx;
      const plugin = new BeforeGetFieldPlugin();
      // Add the plugin before, b/c if join-preloading is enabled, we'll `getField` the value during
      // populate, and then m2o.get will be cached and not hit `getField`.
      // ...maybe ManyToOneReferenceImpl.doGet should also call beforeGetField on every invocation?
      em.addPlugin(plugin);
      const b1 = await em.load(Book, "b:1", "author");
      const _ = b1.author.get;
      if (isPreloadingEnabled) {
        expect(plugin.calls[plugin.calls.length - 1]).toMatchEntity([b1, "author"]);
      } else {
        // If we're not preloaded, then the `m2o.load` checks if the value changed while in-flight,
        // which accesses `author.id`, so look at the 2nd to last call to find `book.author`.
        expect(plugin.calls[plugin.calls.length - 2]).toMatchEntity([b1, "author"]);
      }
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
