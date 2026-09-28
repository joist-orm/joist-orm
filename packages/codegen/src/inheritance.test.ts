import { config as configSchema } from "./config.ts";
import { type DbMetadata, makeEntity } from "./EntityDbMetadata.ts";
import { applyInheritanceUpdates } from "./inheritance.ts";

// These cover codegen *rejecting* an invalid `joist-config.json`, which cannot be an integration test:
// the fixture would have to be broken for the whole package to reproduce it. Everything these rules
// accept is covered black-box instead, via the `Task` STI fixture. See AGENTS.md.
describe("inheritance", () => {
  describe("single table inheritance", () => {
    it("fails when a notNull column with no default is pushed down to a subtype", () => {
      // Given a notNull column with no database default that config pushes down to just one subtype
      const db = newStiDb({ fieldName: "specialOldField", notNull: true, columnDefault: null });
      const config = newStiConfig({ specialOldField: { stiType: "TaskOld" } });
      // When we expand the subtypes
      const result = () => applyInheritanceUpdates(config, db);
      // Then we fail, because the other subtype has nothing to insert for it
      expect(result).toThrow(
        "Task.specialOldField is notNull with no database default, so it cannot be pushed down to 'TaskOld'",
      );
    });

    it("allows a notNull column with no default when every subtype claims it", () => {
      // Given a notNull column with no default, claimed by every subtype
      const db = newStiDb({ fieldName: "specialOldField", notNull: true, columnDefault: null });
      const config = newStiConfig({ specialOldField: { stiType: ["TaskNew", "TaskOld"] } });
      // When we expand the subtypes
      applyInheritanceUpdates(config, db);
      // Then it is allowed, because no subtype is left without a value to insert
      const [task] = db.entities;
      expect(task.subTypes.map((st) => st.primitives.map((p) => p.fieldName))).toEqual([
        ["specialOldField"],
        ["specialOldField"],
      ]);
    });

    it("fails on an unknown subtype name in an stiType array", () => {
      // Given an stiType array naming a subtype that does not exist
      const db = newStiDb({ fieldName: "specialOldField", notNull: false, columnDefault: null });
      const config = newStiConfig({ specialOldField: { stiType: ["TaskOld", "TaskBorrowed"] } });
      // When we expand the subtypes
      const result = () => applyInheritanceUpdates(config, db);
      // Then we fail naming the bad entry
      expect(result).toThrow("specialOldField.stiType 'TaskBorrowed' is invalid");
    });
  });
});

function newStiConfig(fields: Record<string, unknown>) {
  return configSchema.parse({
    entities: {
      Task: { tag: "task", fields: { ...fields, type: { stiDiscriminator: { NEW: "TaskNew", OLD: "TaskOld" } } } },
    },
  });
}

function newStiDb({
  fieldName,
  notNull,
  columnDefault,
}: {
  fieldName: string;
  notNull: boolean;
  columnDefault: number | null;
}): DbMetadata {
  const task: any = {
    ...makeEmptyEntity("Task"),
    primitives: [{ fieldName, notNull, columnDefault, columnName: "special_old_field" }],
    enums: [
      {
        fieldName: "type",
        notNull: true,
        columnDefault: null,
        columnName: "type_id",
        enumRows: [
          { id: 1, code: "NEW", name: "New" },
          { id: 2, code: "OLD", name: "Old" },
        ],
      },
    ],
  };
  return {
    entities: [task],
    entitiesByName: { Task: task },
    enums: {},
    pgEnums: {},
    joinTables: [],
    otherTables: [],
    totalTables: 1,
  };
}

function makeEmptyEntity(name: string): any {
  return {
    name,
    entity: makeEntity(name),
    tableName: "tasks",
    tagName: "task",
    primaryKey: { fieldName: "id" },
    primitives: [],
    enums: [],
    pgEnums: [],
    manyToOnes: [],
    oneToManys: [],
    largeOneToManys: [],
    oneToOnes: [],
    manyToManys: [],
    largeManyToManys: [],
    manyToManyEnums: [],
    polymorphics: [],
    subTypes: [],
    nonDeferredFks: [],
    nonDeferredManyToManyFks: [],
  };
}
