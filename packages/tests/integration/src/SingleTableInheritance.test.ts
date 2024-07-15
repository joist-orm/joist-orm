import { getProperties } from "joist-orm";
import {
  newAuthor,
  newTask,
  newTaskItem,
  newTaskNew,
  newTaskOld,
  Task,
  TaskItem,
  TaskNew,
  TaskOld,
  TaskType,
} from "src/entities";
import { insertTask, insertTaskItem, select } from "src/entities/inserts";
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

  it("keeps subtype fields off of the base type", async () => {
    const em = newEntityManager();
    const t = newTask(em);
    // @ts-expect-error
    expect(t.specialNewField).toBeUndefined();
    // @ts-expect-error
    expect(t.specialOldField).toBeUndefined();
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
    newTask(em);
    const t2 = newTaskOld(em);
    const t3 = newTaskNew(em);
    await em.flush();
    expect(t2.transientFields.oldSimpleRuleRan).toBe(true);
    expect(t3.transientFields.newSimpleRuleRan).toBe(true);
  });

  it("can bulk-create tasks of each type", async () => {
    const em = newEntityManager();
    newTask(em);
    newTask(em);
    newTaskOld(em);
    newTaskOld(em, { specialOldField: 1 });
    newTaskNew(em);
    newTaskNew(em, { specialNewField: 2 });
    await em.flush();
    const rows = await select("tasks");
    expect(rows).toMatchObject([
      {
        id: 1,
        type_id: null,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 2,
        type_id: null,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 3,
        type_id: 1,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: 0,
      },
      {
        id: 4,
        type_id: 1,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: 1,
      },
      {
        id: 5,
        type_id: 2,
        duration_in_days: 10,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 6,
        type_id: 2,
        duration_in_days: 10,
        special_new_field: 2,
        special_old_field: null,
      },
    ]);
  });

  it("can bulk-update tasks of each type", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "NEW", special_new_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });
    await insertTask({ type: "OLD", special_old_field: 1 });

    const em = newEntityManager();
    const [nt1, nt2] = await em.find(TaskNew, {});
    const [ot1, ot2] = await em.find(TaskOld, {});
    nt1.specialNewField = 2;
    nt2.specialNewField = 2;
    ot1.specialOldField++;
    ot2.specialOldField++;
    await em.flush();

    const rows = await select("tasks");
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
    expect(Object.keys(getProperties(Task.metadata))).toMatchInlineSnapshot(`
     [
       "typeDetails",
       "isOld",
       "isNew",
       "taskTaskItems",
       "tags",
     ]
    `);
    expect(Object.keys(getProperties(TaskNew.metadata))).toMatchInlineSnapshot(`
     [
       "newTaskTaskItems",
       "specialNewAuthor",
       "typeDetails",
       "isOld",
       "isNew",
       "taskTaskItems",
       "tags",
     ]
    `);
    expect(Object.keys(getProperties(TaskOld.metadata))).toMatchInlineSnapshot(`
     [
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
     ]
    `);
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
    const t = newTask(em);
    const ot = newTaskOld(em, { specialOldField: 1 });
    const nt = newTaskNew(em, { specialNewField: 2 });
    // Given ti.newTask points to TaskNew, and ti.oldTask points to TaskOld
    const ti = newTaskItem(em, { task: t, newTask: nt, oldTask: ot });
    await em.flush();
    // Then we can access those with the right types
    expect(ti.oldTask.get!.specialOldField).toBe(1);
    expect(ti.newTask.get!.specialNewField).toBe(2);
  });

  it("cannot use the wrong task type for a m2o FK", async () => {
    const em = newEntityManager();
    const t = newTask(em);
    const ot = newTaskOld(em, { specialOldField: 1 });
    const nt = newTaskNew(em, { specialNewField: 2 });
    // @ts-expect-error
    newTaskItem(em, { task: t, newTask: ot, oldTask: ot });
    // @ts-expect-error
    newTaskItem(em, { task: t, newTask: nt, oldTask: nt });
    await expect(em.flush()).rejects.toThrow(
      "TaskItem#1 TaskOld#1 must be a TaskNew, TaskItem#2 TaskNew#1 must be a TaskOld",
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
    // Given we've configured specialOldField to be stiNotNull
    const ot = newTaskOld(em, {});
    // Then we can access it without a null check
    expect(ot.specialOldField.toString()).toBe("0");
    // But fields without the stiNotNull
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
});
