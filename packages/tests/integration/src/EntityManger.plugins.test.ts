import { Entity, EntityMetadata, getMetadata, ParsedFindQuery, Plugin } from "joist-orm";
import { ImmutableEntitiesPlugin } from "joist-orm/build/plugins/ImmutableEntitiesPlugin";
import { describe } from "node:test";
import { Author, Image, newAuthor } from "src/entities";
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
      callCount = 0;
      field: string = undefined!;
      originalValue: any;
      newValue: any;

      beforeSetField(entity: Entity, field: string, newValue: any) {
        this.callCount += 1;
        this.field = field;
        this.originalValue = entity[field as keyof Entity];
        this.newValue = newValue;
      }
    }

    it.withCtx("is called before an entity's field is set", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeSetFieldPlugin();
      em.addPlugin(plugin);
      expect(plugin.callCount).toBe(0);
      // use Image because it doesn't have any defaults that would call setField multiple times on create
      const author = em.createPartial(Image, { fileName: "original name" });
      expect(plugin.callCount).toBe(1);
      expect(plugin.field).toBe("fileName");
      expect(plugin.originalValue).toBe(undefined);
      expect(plugin.newValue).toBe("original name");
      author.fileName = "new name";
      expect(plugin.callCount).toBe(2);
      expect(plugin.field).toBe("fileName");
      expect(plugin.originalValue).toBe("original name");
      expect(plugin.newValue).toBe("new name");
    });
  });

  describe("beforeFind", () => {
    class BeforeFindPlugin extends Plugin {
      callCount = 0;
      meta: EntityMetadata = undefined!;
      query: ParsedFindQuery = undefined!;

      beforeFind(meta: EntityMetadata, query: ParsedFindQuery) {
        this.callCount += 1;
        this.meta = meta;
        this.query = query;
      }
    }

    it.withCtx("is called with the meta and query when a single query is executed", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.callCount).toBe(0);
      await em.find(Author, {});
      expect(plugin.callCount).toBe(1);
      expect(plugin.meta).toBe(getMetadata(Author));
      expect(plugin.query).toMatchObject({});
    });

    it.withCtx("is called once with the meta and query when multiple queries are executed", async (ctx) => {
      const { em } = ctx;
      const plugin = new BeforeFindPlugin();
      em.addPlugin(plugin);
      expect(plugin.callCount).toBe(0);
      await Promise.all([em.find(Author, {}), em.find(Author, {})]);
      expect(plugin.callCount).toBe(1);
      expect(plugin.meta).toBe(getMetadata(Author));
      expect(plugin.query).toMatchObject({});
    });
  });
});
