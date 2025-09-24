import { ImmutableEntitiesPlugin } from "joist-orm/build/plugins/ImmutableEntitiesPlugin";
import { newAuthor } from "src/entities";
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
});
