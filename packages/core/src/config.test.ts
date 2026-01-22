import { findUserCodeLine, getFilePath } from "./config";

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
});
