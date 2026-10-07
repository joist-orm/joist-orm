import { ConfigApi, findUserCodeLine, getFilePath } from "src/config.ts";
import type { Entity } from "src/Entity.ts";

describe("config", () => {
  describe("findUserCodeLine", () => {
    it("finds ReactiveReference recalc", () => {
      const lines = [
        "    at getStackFromCapture (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/config.ts:388:9)",
        "    at getFuzzyCallerName (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/config.ts:340:15)",
        "    at FieldLogger.logSet (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/logging/FieldLogger.ts:52:36)",
        "    at setField (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/fields.ts:113:16)",
        "    at ReactiveReferenceImpl.setImpl (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/relations/ReactiveReference.ts:272:13)",
        "    at ReactiveReferenceImpl.doGet (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/relations/ReactiveReference.ts:228:14)",
        "    at <anonymous> (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/relations/ReactiveReference.ts:160:23)",
        "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
        "    at async Promise.allSettled (index 16)",
        "    at async ReactionsManager.recalcPendingDerivedValues (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/ReactionsManager.ts:180:23)",
        "    at async <anonymous> (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/EntityManager.ts:1263:7)",
        "    at async EntityManager.flush (/home/stephen/homebound/graphql-service/node_modules/joist-orm/src/EntityManager.ts:1256:5)",
        "    at async Object.savePersonalizationOptionGroup (/home/stephen/homebound/graphql-service/src/resolvers/mutations/designPackage/savePersonalizationOptionGroupResolver.ts:43:5)",
        "    at async run (/home/stephen/homebound/graphql-service/node_modules/joist-test-utils/src/run.ts:18:18)",
        "    at async <anonymous> (/home/stephen/homebound/graphql-service/src/resolvers/mutations/designPackage/savePersonalizationOptionGroupResolver.test.ts:29:7)",
      ];
      expect(findUserCodeLine(lines)).toMatchInlineSnapshot(
        `"    at async Object.savePersonalizationOptionGroup (/home/stephen/homebound/graphql-service/src/resolvers/mutations/designPackage/savePersonalizationOptionGroupResolver.ts:43:5)"`,
      );
    });

    it("works on cascadeDeletes", () => {
      const lines = [
        "    at getStackFromCapture (/home/node/app/node_modules/joist-orm/src/config.ts:393:9)",
        "    at getFuzzyCallerName (/home/node/app/node_modules/joist-orm/src/config.ts:338:15)",
        "    at FieldLogger.logSet (/home/node/app/node_modules/joist-orm/src/logging/FieldLogger.ts:52:36)",
        "    at setField (/home/node/app/node_modules/joist-orm/src/fields.ts:113:16)",
        "    at ManyToOneReferenceImpl.setImpl (/home/node/app/node_modules/joist-orm/src/relations/ManyToOneReference.ts:231:13)",
        "    at ManyToOneReferenceImpl.set (/home/node/app/node_modules/joist-orm/src/relations/ManyToOneReference.ts:112:10)",
        "    at OneToManyCollection.remove (/home/node/app/node_modules/joist-orm/src/relations/OneToManyCollection.ts:234:34)",
        "    at ManyToOneReferenceImpl.cleanupOnEntityDeleted (/home/node/app/node_modules/joist-orm/src/relations/ManyToOneReference.ts:266:13)",
        "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
        "    at async Promise.all (index 6)",
        "    at async EntityManager.cascadeDeletes (/home/node/app/node_modules/joist-orm/src/EntityManager.ts:1769:5)",
        "    at async <anonymous> (/home/node/app/node_modules/joist-orm/src/EntityManager.ts:1341:11)",
        "    at async runHooksOnPendingEntities (/home/node/app/node_modules/joist-orm/src/EntityManager.ts:1322:9)",
        "    at async EntityManager.flush (/home/node/app/node_modules/joist-orm/src/EntityManager.ts:1388:29)",
        "    at async Object.savePersonalizationOptionGroup (/home/stephen/homebound/graphql-service/src/resolvers/mutations/designPackage/savePersonalizationOptionGroupResolver.ts:46:5)",
      ];
      expect(findUserCodeLine(lines)).toMatchInlineSnapshot(
        `"    at async Object.savePersonalizationOptionGroup (/home/stephen/homebound/graphql-service/src/resolvers/mutations/designPackage/savePersonalizationOptionGroupResolver.ts:46:5)"`,
      );
    });
  });

  describe("getFilePath", () => {
    it("works", () => {
      expect(
        getFilePath(
          "    at async Object.savePersonalizationOptionGroup (/home/stephen/homebound/graphql-service/src/resolvers/mutations/designPackage/savePersonalizationOptionGroupResolver.ts:43:5)",
        ),
      ).toBe("savePersonalizationOptionGroupResolver.ts:43");
    });
  });

  it("rejects unnamed reactions registered through the same helper", () => {
    // Given a payment reaction registered through a shared config helper
    const config = new ConfigApi();
    registerReaction(config);
    // When another reaction uses the same registration location
    // Then registration tells the caller to pass a unique name
    expect(() => registerReaction(config)).toThrow(/Duplicate reaction name .*config.addReaction.*Pass a unique name/);
  });

  it("rejects unnamed transition callbacks registered through the same helper", () => {
    // Given a payment callback registered through a shared config helper
    const config = new ConfigApi();
    registerTransition(config);
    // When another callback uses the same registration location
    // Then registration tells the caller to pass a unique name
    expect(() => registerTransition(config)).toThrow(
      /Duplicate reaction name .*config.onTransition.*Pass a unique name/,
    );
  });

  it("rejects duplicate explicit reaction names", () => {
    // Given a reaction named payment
    const config = new ConfigApi();
    registerReaction(config, "payment");
    // When another reaction requests the same name
    // Then registration rejects the duplicate name
    expect(() => registerReaction(config, "payment")).toThrow(
      'Duplicate reaction name "payment" in config.addReaction',
    );
  });

  it("rejects duplicate explicit transition names", () => {
    // Given a transition callback named payment
    const config = new ConfigApi();
    registerTransition(config, "payment");
    // When another callback requests the same name
    // Then registration rejects the duplicate name
    expect(() => registerTransition(config, "payment")).toThrow(
      'Duplicate reaction name "payment" in config.onTransition',
    );
  });

  it("rejects transition names already used by ordinary reactions", () => {
    // Given an ordinary reaction named payment
    const config = new ConfigApi();
    registerReaction(config, "payment");
    // When a transition callback requests the same name
    // Then registration rejects the shared reaction identity
    expect(() => registerTransition(config, "payment")).toThrow(
      'Duplicate reaction name "payment" in config.onTransition',
    );
  });

  it("rejects duplicate commit-phase transition names", () => {
    // Given a commit-phase callback named payment
    const config = new ConfigApi();
    config.onTransition("payment", "status", { phase: "commit" }, () => {});
    // When another commit-phase callback requests the same name
    // Then registration rejects the duplicate callback name
    expect(() => config.onTransition("payment", "status", { phase: "commit" }, () => {})).toThrow(
      'Duplicate reaction name "payment" in config.onTransition',
    );
  });

  it("registers separately named reactions through the same helper", () => {
    // Given a config shared by two payment reactions
    const config = new ConfigApi();
    // When both reactions use their own names
    registerReaction(config, "recordPayment");
    registerReaction(config, "notifyAuthor");
    // Then both named reactions are registered
    expect(config.__data.reactions.map((reaction) => reaction.name)).toEqual(["recordPayment", "notifyAuthor"]);
  });

  it("registers separately named transitions through the same helper", () => {
    // Given a config shared by two payment callbacks
    const config = new ConfigApi();
    // When both callbacks use their own names
    registerTransition(config, "recordPayment");
    registerTransition(config, "notifyAuthor");
    // Then both named callbacks are registered
    expect(config.__data.transitions.status.callbacks.map((callback) => callback.name)).toEqual([
      "recordPayment",
      "notifyAuthor",
    ]);
  });
});

/** Registers payment reactions through one source location, optionally with their own names. */
function registerReaction(config: ConfigApi<Entity, unknown>, name?: string): void {
  config.addReaction({ name }, {}, () => {});
}

/** Registers payment callbacks through one source location, optionally with their own names. */
function registerTransition(config: ConfigApi<Entity, unknown>, name?: string): void {
  if (name === undefined) {
    config.onTransition("status", {}, () => {});
  } else {
    config.onTransition(name, "status", {}, () => {});
  }
}
