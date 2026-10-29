import { getProperties } from "joist-orm";
import {
  Author,
  Task,
  TaskItem,
  TaskNew,
  TaskOld,
  TaskThird,
  TaskType,
  newAuthor,
  newTaskItem,
  newTaskNew,
  newTaskOld,
  newTaskThird,
} from "src/entities";
import { insertAuthor, insertTag, insertTask, insertTaskItem, insertTaskToTag, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("SingleTableInheritance", () => {
  it("can create a TaskOld", async () => {
    const em = newEntityManager();
    newTaskOld(em, { specialOldField: 1 });
    await em.flush();
    const [row] = await select("tasks");
    expect(row).toMatchObject({
      id: 1,
      type_id: 1,
      special_new_field: null,
      special_old_field: 1,
      duration_in_days: 10,
    });

    const em2 = newEntityManager();
    const ot = await em2.load(Task, "task:1");
    expect(ot).toBeInstanceOf(TaskOld);
  });

  it("can create a TaskNew", async () => {
    const em = newEntityManager();
    newTaskNew(em, { specialNewField: 1 });
    await em.flush();
    const [row] = await select("tasks");
    expect(row).toMatchObject({
      id: 1,
      type_id: 2,
      special_new_field: 1,
      special_old_field: null,
      duration_in_days: 10,
    });

    const em2 = newEntityManager();
    const ot = await em2.load("task:1");
    expect(ot).toBeInstanceOf(TaskNew);
  });

  it("can push a field down to several subtypes but not all of them", async () => {
    const em = newEntityManager();
    newTaskNew(em, { sharedSubtypeField: 1 });
    newTaskOld(em, { sharedSubtypeField: 2 });
    // `TaskThird` is not in the `stiType` array, so it does not have the field to set at all --
    // `newTaskThird(em, { sharedSubtypeField: 3 })` would not compile
    newTaskThird(em);
    await em.flush();
    const rows = await select("tasks");
    expect(rows).toMatchObject([
      { id: 1, type_id: 2, shared_subtype_field: 1 },
      { id: 2, type_id: 1, shared_subtype_field: 2 },
      { id: 3, type_id: 3, shared_subtype_field: null },
    ]);
  });

  it("inserts each subtype separately so subtype columns keep their defaults", async () => {
    const em = newEntityManager();
    newTaskNew(em, { specialNewField: 1 });
    newTaskOld(em, { specialOldField: 2, specialOldFieldWithDefault: 3 });
    resetQueryCount();
    await em.flush();
    // TaskNew does not know `special_old_field_with_default`, so it is left out of TaskNew's INSERT and
    // the database applies its default; a single INSERT across both subtypes would bind NULL and fail.
    const rows = await select("tasks");
    expect(rows).toMatchObject([
      { id: 1, type_id: 2, special_new_field: 1, special_old_field_with_default: 0 },
      { id: 2, type_id: 1, special_old_field: 2, special_old_field_with_default: 3 },
    ]);
  });

  it("can instantiate a TaskOld", async () => {
    await insertTask({ type: "OLD", special_old_field: 1 });
    const em = newEntityManager();
    resetQueryCount();
    const [t1] = await em.find(TaskOld, {});
    expect(t1).toBeInstanceOf(TaskOld);
    expect(t1).toMatchEntity({
      specialOldField: 1,
      durationInDays: 0,
    });
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT t.* FROM tasks AS t WHERE t.type_id = $1 AND t.deleted_at IS NULL ORDER BY t.id ASC LIMIT $2",
     ]
    `);
  });

  it("can instantiate a TaskNew", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    const em = newEntityManager();
    const [t1] = await em.find(TaskNew, {});
    expect(t1).toBeInstanceOf(TaskNew);
    expect(t1).toMatchEntity({
      specialNewField: 1,
      durationInDays: 0,
    });
  });

  it("can instantiate intermixed tasks", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });
    const em = newEntityManager();
    const [t1, t2] = await em.find(Task, {});
    expect(t1).toBeInstanceOf(TaskNew);
    expect(t2).toBeInstanceOf(TaskOld);
  });

  it("can load a m2m on a batch of mixed STI subtypes", async () => {
    // Given two different subtypes that each have a tag, sharing the `task_to_tags` m2m
    // that is declared on the STI base `Task`
    await insertTag({ id: 1, name: "t1" });
    await insertTask({ id: 1, type: "OLD" });
    await insertTask({ id: 2, type: "NEW" });
    await insertTaskToTag({ id: 1, task_id: 1, tag_id: 1 });
    await insertTaskToTag({ id: 2, task_id: 2, tag_id: 1 });
    const em = newEntityManager();
    const unloaded = await em.loadAll(Task, ["task:1", "task:2"]);
    // When we populate `tags` for both subtypes, which share a single `task_to_tags` JoinRows
    const tasks = await em.populate(unloaded, "tags");
    // Then the rows load via the base `Task` meta instead of `em.loadAll(<one subtype>, <both ids>)`,
    // so the STI guard does not fire and each task gets its tag
    expect(tasks[0]).toBeInstanceOf(TaskOld);
    expect(tasks[1]).toBeInstanceOf(TaskNew);
    expect(tasks[0].tags.get).toMatchEntity([{ name: "t1" }]);
    expect(tasks[1].tags.get).toMatchEntity([{ name: "t1" }]);
  });

  it("keeps subtype fields off of the base type", async () => {
    const em = newEntityManager();
    const nt = newTaskNew(em);
    const ot = newTaskOld(em);
    // @ts-expect-error
    expect(ot.specialNewField).toBeUndefined();
    // @ts-expect-error
    expect(nt.specialOldField).toBeUndefined();
    // @ts-expect-error
    await expect(em.find(Task, { specialNewField: 1 })).rejects.toThrow("Field 'specialNewField' not found on tasks");
  });

  it("supports self-referential FKs to a subtype", async () => {
    const em = newEntityManager();
    const nt = newTaskNew(em);
    const ot = newTaskOld(em);
    const ot2 = newTaskOld(em, { parentOldTask: ot });
    // @ts-expect-error
    expect(nt.parentOldTask).toBeUndefined();
    expect(ot.parentOldTask).toBeDefined();
    // @ts-expect-error
    expect(nt.tasks).toBeUndefined();
    expect(ot.tasks).toBeDefined();
    await em.flush();
    expect(ot).toMatchEntity({ tasks: [ot2] });
  });

  it("supports self-referential FKs specialized to our self subtype", async () => {
    const em = newEntityManager();
    const nt = newTaskNew(em);
    const ot = newTaskOld(em);
    // We can refer to our own type and flush cleanly
    newTaskOld(em, { copiedFrom: ot });
    await em.flush();
    // Opts cannot enforce the constraint
    const ot2 = newTaskOld(em, { copiedFrom: nt });
    // But ManyToOneReference.set can
    // @ts-expect-error
    ot2.copiedFrom.set(nt);
    // And either way it fails at runtime
    await expect(em.flush()).rejects.toThrow("TaskOld#4 copiedFrom must be a TaskOld not TaskNew#1:1");
  });

  it("only adds subtype fields to correct subtype", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    expect(newTaskOld(em).specialNewField).toBeUndefined();
    // @ts-expect-error
    expect(newTaskNew(em).specialOldField).toBeUndefined();
    // @ts-expect-error
    await expect(em.find(TaskNew, { specialOldField: 1 })).rejects.toThrow(
      "Field 'specialOldField' not found on tasks",
    );
  });

  it("can query by subtype fields from the subtype", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "NEW", special_new_field: 2 });
    const em = newEntityManager();
    const tasks = await em.find(TaskNew, { specialNewField: 1 });
    expect(tasks).toHaveLength(1);
  });

  it("can query for sub-types and get implicit filters", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });
    const em = newEntityManager();
    const tasks = await em.find(TaskNew, {});
    expect(tasks).toMatchEntity([{ type: TaskType.New }]);
  });

  it("can have subtype-specific hooks", async () => {
    const em = newEntityManager();
    const t2 = newTaskOld(em);
    const t3 = newTaskNew(em);
    await em.flush();
    expect(t2.transientFields.oldSimpleRuleRan).toBe(true);
    expect(t3.transientFields.newSimpleRuleRan).toBe(true);
  });

  it("can bulk-create tasks of each type", async () => {
    const em = newEntityManager();
    newTaskOld(em);
    newTaskOld(em, { specialOldField: 1 });
    newTaskNew(em);
    newTaskNew(em, { specialNewField: 2 });
    await em.flush();
    const rows = await select("tasks");
    expect(rows).toMatchObject([
      {
        id: 1,
        type_id: 1,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: 0,
      },
      {
        id: 2,
        type_id: 1,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: 1,
      },
      {
        id: 3,
        type_id: 2,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 4,
        type_id: 2,
        duration_in_days: 10,
        special_new_field: 2,
        special_old_field: null,
      },
    ]);
  });

  it("can bulk-update tasks of each type", async () => {
    // Given both task subtypes have their required slot
    await insertAuthor({ id: 1, first_name: "slot" });
    // And each subtype has two persisted tasks
    await insertTask({ type: "NEW", special_new_field: 1, slot_id: 1 });
    await insertTask({ type: "NEW", special_new_field: 1, slot_id: 1 });
    await insertTask({ type: "OLD", special_old_field: 1, slot_id: 1 });
    await insertTask({ type: "OLD", special_old_field: 1, slot_id: 1 });

    const em = newEntityManager();
    const [nt1, nt2] = await em.find(TaskNew, {});
    const [ot1, ot2] = await em.find(TaskOld, {});

    // When each subtype changes its own field
    nt1.specialNewField = 2;
    nt2.specialNewField = 2;
    ot1.specialOldField++;
    ot2.specialOldField++;
    await em.flush();

    const rows = await select("tasks");
    // Then all four tasks retain their subtype-specific values
    expect(rows).toMatchObject([
      { id: 1, type_id: 2, special_new_field: 2 },
      { id: 2, type_id: 2, special_new_field: 2 },
      { id: 3, type_id: 1, special_old_field: 2 },
      { id: 4, type_id: 1, special_old_field: 2 },
    ]);
  });

  it("can bulk-delete tasks of each type", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });

    const em = newEntityManager();
    const [nt1, nt2] = await em.find(TaskNew, { type: TaskType.New });
    const [ot1, ot2] = await em.find(TaskOld, { type: TaskType.Old });
    em.delete(nt1);
    em.delete(nt2);
    em.delete(ot1);
    em.delete(ot2);
    await em.flush();

    const rows = await select("tasks");
    expect(rows).toMatchObject([]);
  });

  it("reports the right properties", () => {
    expect(Object.keys(getProperties(Task.metadata))).toEqual(
      expect.arrayContaining(["typeDetails", "isOld", "isNew", "taskTaskItems", "tags"]),
    );
    // And does not include the recursive selfReferential field which is configured to be skipped
    expect(Object.keys(getProperties(TaskNew.metadata))).toEqual(
      expect.arrayContaining([
        "newTaskTaskItems",
        "selfReferentialTasks",
        "selfReferential",
        "specialNewAuthor",
        "typeDetails",
        "isOld",
        "isNew",
        "taskTaskItems",
        "tags",
      ]),
    );
    expect(Object.keys(getProperties(TaskOld.metadata))).toEqual(
      expect.arrayContaining([
        "commentParentInfo",
        "comments",
        "oldTaskTaskItems",
        "tasks",
        "parentOldTask",
        "parentOldTasksRecursive",
        "tasksRecursive",
        "publishers",
        "typeDetails",
        "isOld",
        "isNew",
        "taskTaskItems",
        "tags",
      ]),
    );
  });

  it("prevents the discriminator column from being updated", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    const em = newEntityManager();
    const t1 = await em.load(Task, "task:1");
    t1.type = TaskType.Old;
    await expect(em.flush()).rejects.toThrow("type cannot be updated");
  });

  it("can use hints to differentiate between old and new task m2o FKs", async () => {
    const em = newEntityManager();
    const ot = newTaskOld(em, { specialOldField: 1 });
    const nt = newTaskNew(em, { specialNewField: 2 });
    // Given ti.newTask points to TaskNew, and ti.oldTask points to TaskOld
    const ti = newTaskItem(em, { task: ot, newTask: nt, oldTask: ot });
    await em.flush();
    // Then we can access those with the right types
    expect(ti.oldTask.get!.specialOldField).toBe(1);
    expect(ti.newTask.get!.specialNewField).toBe(2);
  });

  it("cannot use the wrong task type for a m2o FK", async () => {
    const em = newEntityManager();
    const ot = newTaskOld(em, { specialOldField: 1 });
    const nt = newTaskNew(em, { specialNewField: 2 });
    // NOTE: `task` field can be either old or new
    // @ts-expect-error
    newTaskItem(em, { task: ot, newTask: ot, oldTask: ot });
    // @ts-expect-error
    newTaskItem(em, { task: nt, newTask: nt, oldTask: nt });
    await expect(em.flush()).rejects.toThrow(
      "TaskItem#1 newTask must be a TaskNew not TaskOld#1, TaskItem#2 oldTask must be a TaskOld not TaskNew#2",
    );
  });

  it("can use hints to differentiate o2m collections", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    // Given only a TaskNew can point to an Author
    newTaskNew(em, { specialNewField: 1, specialNewAuthor: a });
    newTaskNew(em, { specialNewField: 2, specialNewAuthor: a });
    await em.flush();
    // Then we can access it with the right types
    expect(a.tasks.get).toHaveLength(2);
    expect(a.tasks.get[0].specialNewField).toBe(1);
    expect(a.tasks.get[1].specialNewField).toBe(2);
  });

  it("can mark subtype fields as required", async () => {
    const em = newEntityManager();
    // Given we've configured specialOldField to be notNull: true
    const ot = newTaskOld(em, {});
    // Then we can access it without a null check
    expect(ot.specialOldField.toString()).toBe("0");
    // But fields without the notNull
    const nt = newTaskNew(em, { specialNewField: 2 });
    // Do require the null check
    // @ts-expect-error
    expect(nt.specialNewField.toString()).toBe("2");
  });

  it("subtypes use defaults from the base type", async () => {
    const em = newEntityManager();
    const ot = newTaskOld(em, {});
    expect(ot.durationInDays).toBe(10);
  });

  it("filters out soft-deletes when querying by subtype", async () => {
    const em = newEntityManager();
    newTaskOld(em, { deletedAt: new Date() });
    await em.flush();
    expect(await em.find(TaskOld, {})).toMatchEntity([]);
  });

  it("filters out soft-deletes from collections", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    newTaskNew(em, { deletedAt: new Date(), specialNewAuthor: a });
    await em.flush();
    expect(a.tasks.get).toMatchEntity([]);
  });

  it("can filter using subtype specific filters", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });
    await insertTaskItem({ task_id: 1 });
    const em = newEntityManager();
    const items = await em.find(TaskItem, { taskTaskNew: { specialNewField: 1 } });
    expect(items).toMatchEntity([{}]);
  });

  it("runs reactive validation rules", async () => {
    const em = newEntityManager();
    const ot = newTaskOld(em, {});
    const nt = newTaskNew(em, {});
    await em.flush();
    expect(ot.transientFields.oldReactiveRuleRan).toBe(true);
    expect(nt.transientFields.newReactiveRuleRan).toBe(true);
  });

  it("setDefaults work as expected for subtypes", async () => {
    const em = newEntityManager();
    const ot = newTaskOld(em, {});
    const nt = newTaskNew(em, {});
    await em.flush();

    const tasks = await select("tasks");
    expect(tasks.length).toEqual(2);
    // Then TaskOld persisted its defaults
    expect(tasks[0].id).toEqual(1);
    expect(tasks[0].sync_default).toEqual("TaskOld");
    expect(tasks[0].async_default_1).toEqual("TaskOld Async1");
    expect(tasks[0].async_default_2).toEqual("TaskOld Async1 Async2");
    // And TaskNew persisted its defaults
    expect(tasks[1].id).toEqual(2);
    expect(tasks[1].sync_default).toEqual("TaskNew");
    expect(tasks[1].async_default_1).toEqual("TaskNew Async1");
    expect(tasks[1].async_default_2).toEqual("TaskNew Async1 Async2");

    // And the entities reflect the values
    expect(ot).toMatchEntity({
      syncDefault: "TaskOld",
      asyncDefault_1: "TaskOld Async1",
      asyncDefault_2: "TaskOld Async1 Async2",
    });
    expect(nt).toMatchEntity({
      syncDefault: "TaskNew",
      asyncDefault_1: "TaskNew Async1",
      asyncDefault_2: "TaskNew Async1 Async2",
    });
  });

  it("derived fields work as expected", async () => {
    const em = newEntityManager();
    const ot = newTaskOld(em, {});
    const nt = newTaskNew(em, {});
    await em.flush();

    const tasks = await select("tasks");
    expect(tasks.length).toEqual(2);
    // Then TaskOld persisted its derived fields
    expect(tasks[0].id).toEqual(1);
    expect(tasks[0].sync_derived).toEqual("SyncDerivedOld");
    expect(tasks[0].async_derived).toEqual("SyncDerivedOld AsyncDerived");
    // And TaskNew persisted its derived fields
    expect(tasks[1].id).toEqual(2);
    expect(tasks[1].sync_derived).toEqual("SyncDerivedNew");
    expect(tasks[1].async_derived).toEqual("SyncDerivedNew AsyncDerived");

    // And the entities reflect the values
    expect(ot).toMatchEntity({
      syncDerived: "SyncDerivedOld",
      asyncDerived: "SyncDerivedOld AsyncDerived",
    });
    expect(nt).toMatchEntity({
      syncDerived: "SyncDerivedNew",
      asyncDerived: "SyncDerivedNew AsyncDerived",
    });
  });

  it("load throws on loading a small publisher as a large publisher", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    const em = newEntityManager();
    await expect(em.load(TaskOld, "task:1")).rejects.toThrow("TaskNew:1 is TaskNew but should be TaskOld");
  });

  it("loadAll throws on loading a small publisher as a large publisher", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    const em = newEntityManager();
    await expect(em.loadAll(TaskOld, ["task:1"])).rejects.toThrow("TaskNew:1 were not of type TaskOld");
  });

  it("updates a required relation shared by two STI subtypes", async () => {
    // Given TaskNew and TaskOld share slot, like ItemTemplateItem and ProjectCustomItem
    const em = newEntityManager();
    const task = newTaskNew(em);
    // And a persisted slot that can replace the task's original slot
    const slot = newAuthor(em);
    await em.flush();

    // When a persisted TaskNew changes its slot
    task.slot.set(slot);
    await em.flush();

    // Then its new slot is persisted without an ambiguous slot_id column
    expect(await select("tasks")).toMatchObject([{ id: 1, slot_id: Number(slot.idUntagged) }]);
  });

  it("preserves shared fields when updating all three STI subtypes together", async () => {
    // Given both slot-bearing subtypes and TaskThird, like TakeoffLineItemVersion without slot
    const em = newEntityManager();
    const newTask = newTaskNew(em, { sharedSubtypeField: 1, slot: {} });
    const oldTask = newTaskOld(em, { sharedSubtypeField: 2, slot: {} });
    const unchangedTask = newTaskOld(em, { sharedSubtypeField: 3, slot: {} });
    const thirdTask = newTaskThird(em);
    // And distinct replacement slots for the two slot-bearing subtypes
    const newSlot = newAuthor(em);
    const oldSlot = newAuthor(em);
    await em.flush();
    // And reloaded tasks have not accessed their unchanged shared values
    const em2 = newEntityManager();
    const [nt, ot, unchanged, third] = await Promise.all([
      em2.load(TaskNew, newTask.id),
      em2.load(TaskOld, oldTask.id),
      em2.load(TaskOld, unchangedTask.id),
      em2.load(TaskThird, thirdTask.id),
    ]);

    // When both slots change while other tasks change only base fields
    nt.slot.set(await em2.load(Author, newSlot.id));
    nt.sharedSubtypeField = 10;
    ot.slot.set(await em2.load(Author, oldSlot.id));
    ot.sharedSubtypeField = 20;
    unchanged.durationInDays = 30;
    third.durationInDays = 40;
    await em2.flush();

    // Then changed values, unchanged shared values, and the subtype without slot are preserved
    expect(await select("tasks")).toMatchObject([
      { id: Number(nt.idUntagged), slot_id: Number(newSlot.idUntagged), shared_subtype_field: 10 },
      { id: Number(ot.idUntagged), slot_id: Number(oldSlot.idUntagged), shared_subtype_field: 20 },
      {
        id: Number(unchanged.idUntagged),
        slot_id: Number(unchanged.slot.idUntagged),
        shared_subtype_field: 3,
        duration_in_days: 30,
      },
      { id: Number(third.idUntagged), slot_id: null, shared_subtype_field: null, duration_in_days: 40 },
    ]);
  });

  it("keeps a shared subtype relation off the base and the nonparticipating subtype", () => {
    // Given TaskThird does not participate in the slot relation
    const em = newEntityManager();
    const third = newTaskThird(em);

    // When inspecting its generated relation and the abstract base's fields
    // Then neither exposes slot, including in the generated TypeScript API
    // @ts-expect-error TaskThird has no slot relation
    expect(third.slot).toBeUndefined();
    expect(Task.metadata.allFields.slot).toBeUndefined();
  });

  it("loads both participating subtypes through the reverse relation", async () => {
    // Given both slot-bearing subtypes point at the same slot
    const em = newEntityManager();
    const slot = newAuthor(em);
    newTaskNew(em, { slot });
    newTaskOld(em, { slot });
    // And the nonparticipating subtype has no slot
    newTaskThird(em);
    await em.flush();

    // When the slot's tasks are loaded in a fresh EntityManager
    const em2 = newEntityManager();
    const reloaded = await em2.load(Author, slot.id);
    const tasks = await reloaded.slottedTasks.load();

    // Then neither participating subtype is excluded by an implicit discriminator filter
    expect(tasks).toMatchEntity([{ type: TaskType.New }, { type: TaskType.Old }]);
  });

  it("names each physical column once in a mixed-subtype batch UPDATE", async () => {
    // Given all three subtypes share a table, but only TaskNew and TaskOld have slot
    const em = newEntityManager();
    const nt = newTaskNew(em);
    const ot = newTaskOld(em);
    const third = newTaskThird(em);
    // And a replacement slot already exists
    const slot = newAuthor(em);
    await em.flush();

    // When a batch changes both shared fields and a base field
    nt.slot.set(slot);
    ot.slot.set(slot);
    nt.sharedSubtypeField = 1;
    ot.sharedSubtypeField = 2;
    third.durationInDays = 30;
    resetQueryCount();
    await em.flush();

    // Then the data CTE and SET clause each name slot_id and shared_subtype_field once
    expect(queries.filter((q) => q.startsWith("WITH"))).toMatchInlineSnapshot(`
     [
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::int[]) as duration_in_days, unnest($3::timestamp with time zone[]) as updated_at, unnest($4::int[]) as shared_subtype_field, unnest($5::int[]) as slot_id, unnest($6::timestamptz[]) as __original_updated_at) UPDATE tasks SET duration_in_days = data.duration_in_days, updated_at = data.updated_at, shared_subtype_field = data.shared_subtype_field, slot_id = data.slot_id FROM data WHERE tasks.id = data.id AND date_trunc('milliseconds', tasks.updated_at) = data.__original_updated_at RETURNING tasks.id",
     ]
    `);
  });

  it("inserts shared relations for both participating subtypes in the same flush", async () => {
    // Given distinct slots for the two participating subtypes
    const em = newEntityManager();
    const newSlot = newAuthor(em);
    const oldSlot = newAuthor(em);

    // When all three task subtypes are inserted in one flush
    newTaskNew(em, { slot: newSlot });
    newTaskOld(em, { slot: oldSlot });
    newTaskThird(em);
    await em.flush();

    // Then each subtype writes its own slot and the nonparticipating subtype leaves it null
    expect(await select("tasks")).toMatchObject([
      { type_id: 2, slot_id: Number(newSlot.idUntagged) },
      { type_id: 1, slot_id: Number(oldSlot.idUntagged) },
      { type_id: 3, slot_id: null },
    ]);
  });

  it("moves both participating subtypes between loaded reverse collections", async () => {
    // Given both participating subtypes share a slot
    const em = newEntityManager();
    const slot = newAuthor(em);
    const nt = newTaskNew(em, { slot });
    const ot = newTaskOld(em, { slot });
    // And a second slot has an empty reverse collection
    const replacement = newAuthor(em);
    await em.flush();

    // When both tasks move to the second slot
    nt.slot.set(replacement);
    ot.slot.set(replacement);
    await em.flush();

    // Then the original reverse collection no longer has either task
    expect(slot.slottedTasks.get).toMatchEntity([]);
    expect(replacement.slottedTasks.get).toMatchEntity([{ id: nt.id }, { id: ot.id }]);
  });

  it("deletes all three subtypes after inserting shared relations", async () => {
    // Given persisted tasks of all three subtypes
    const em = newEntityManager();
    const nt = newTaskNew(em);
    const ot = newTaskOld(em);
    const third = newTaskThird(em);
    await em.flush();

    // When all three subtypes are deleted in one flush
    em.delete(nt);
    em.delete(ot);
    em.delete(third);
    await em.flush();

    // Then the shared relation does not interfere with deleting their rows
    expect(await select("tasks")).toEqual([]);
  });
});
