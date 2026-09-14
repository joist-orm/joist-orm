import { config as configSchema } from "./config.ts";
import { type DbMetadata, makeEntity } from "./EntityDbMetadata.ts";
import { applyInheritanceUpdates } from "./inheritance.ts";

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
        "Task.specialOldField is notNull with no database default, so it cannot be pushed down to the 'TaskOld' subtype",
      );
    });

    it("allows a notNull column with a default to be pushed down to a subtype", () => {
      // Given a notNull column that has a database default
      const db = newStiDb({ fieldName: "specialOldField", notNull: true, columnDefault: 0 });
      const config = newStiConfig({ specialOldField: { stiType: "TaskOld" } });
      // When we expand the subtypes
      applyInheritanceUpdates(config, db);
      // Then the subtype owns it, and the other subtype will fall back to the default on insert
      const [task] = db.entities;
      expect(task.subTypes.map((st) => [st.name, st.primitives.map((p) => p.fieldName)])).toEqual([
        ["TaskNew", []],
        ["TaskOld", ["specialOldField"]],
      ]);
    });

    it("allows a nullable column to be pushed down to a subtype", () => {
      // Given a nullable column that config pushes down to one subtype, and makes required there
      const db = newStiDb({ fieldName: "specialOldField", notNull: false, columnDefault: null });
      const config = newStiConfig({ specialOldField: { notNull: true, stiType: "TaskOld" } });
      // When we expand the subtypes
      applyInheritanceUpdates(config, db);
      // Then the subtype owns the field, and it is required on that subtype only
      const [task] = db.entities;
      expect(task.primitives).toEqual([]);
      expect(task.subTypes.map((st) => [st.name, st.primitives.map((p) => [p.fieldName, p.notNull])])).toEqual([
        ["TaskNew", []],
        ["TaskOld", [["specialOldField", true]]],
      ]);
    });

    it("leaves a notNull column on the base when no subtype claims it", () => {
      // Given a notNull column that config does not push down
      const db = newStiDb({ fieldName: "specialOldField", notNull: true, columnDefault: null });
      const config = newStiConfig({});
      // When we expand the subtypes
      applyInheritanceUpdates(config, db);
      // Then it stays on the base, where every subtype can set it
      const [task] = db.entities;
      expect(task.primitives.map((p) => p.fieldName)).toEqual(["specialOldField"]);
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
