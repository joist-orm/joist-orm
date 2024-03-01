import { newTask, newTaskNew, newTaskOld, Task, TaskNew, TaskOld, TaskType } from "src/entities";
import { insertTask, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("SingleTableInheritance", () => {
  it("can create a TaskOld", async () => {
    const em = newEntityManager();
    newTaskOld(em, { type: TaskType.Old, specialOldField: 1 });
    await em.flush();
    const [row] = await select("tasks");
    expect(row).toMatchObject({
      id: 1,
      type_id: 1,
      special_new_field: null,
      special_old_field: 1,
      duration_in_days: 0,
    });
  });

  it("can create a TaskNew", async () => {
    const em = newEntityManager();
    newTaskNew(em, { type: TaskType.New, specialNewField: 1 });
    await em.flush();
    const [row] = await select("tasks");
    expect(row).toMatchObject({
      id: 1,
      type_id: 2,
      special_new_field: 1,
      special_old_field: null,
      duration_in_days: 0,
    });
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
       "select t.* from tasks as t order by t.id ASC limit $1",
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

  it("can have subtype-specific hooks", async () => {
    const em = newEntityManager();
    newTask(em);
    const t2 = newTaskOld(em);
    const t3 = newTaskNew(em);
    await em.flush();
    expect(t2.transientFields.oldHookRan).toBe(true);
    expect(t3.transientFields.newHookRan).toBe(true);
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
        duration_in_days: 0,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 2,
        type_id: null,
        duration_in_days: 0,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 3,
        type_id: 1,
        duration_in_days: 0,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 4,
        type_id: 1,
        duration_in_days: 0,
        special_new_field: null,
        special_old_field: 1,
      },
      {
        id: 5,
        type_id: 2,
        duration_in_days: 0,
        special_new_field: null,
        special_old_field: null,
      },
      {
        id: 6,
        type_id: 2,
        duration_in_days: 0,
        special_new_field: 2,
        special_old_field: null,
      },
    ]);
  });

  it("prevents the discriminator column from being updated", async () => {
    await insertTask({ type: "NEW", special_new_field: 1 });
    const em = newEntityManager();
    const t1 = await em.load(Task, "task:1");
    t1.type = TaskType.Old;
    await expect(em.flush()).rejects.toThrow("type cannot be updated");
  });
});
