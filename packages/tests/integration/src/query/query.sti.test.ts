import { query, table } from "joist-orm";
import { Task, TaskNew, TaskOld, TaskType } from "src/entities";
import { insertTask } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("em.query STI entity mode", () => {
  it("hydrates concrete subtypes from an STI root", async () => {
    // Given TaskNew and TaskOld rows in the shared tasks table
    await insertTask({ id: 1, type: "NEW", special_new_field: 10 });
    // And the TaskOld has its own subtype field
    await insertTask({ id: 2, type: "OLD", special_old_field: 20 });
    // And a Task root query can return either concrete subtype
    const em = newEntityManager();
    const t = table(Task);
    resetQueryCount();

    // When selecting the STI root as entities
    const tasks = await em.query({ from: t, select: t, orderBy: { id: "ASC" } });

    // Then the stored discriminator hydrates each concrete subtype
    expect(tasks).toMatchEntity([{ type: TaskType.New }, { type: TaskType.Old }]);
    expect(tasks[0]).toBeInstanceOf(TaskNew);
    expect(tasks[1]).toBeInstanceOf(TaskOld);
    expect((tasks[0] as TaskNew).specialNewField).toBe(10);
    expect((tasks[1] as TaskOld).specialOldField).toBe(20);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT t.* FROM tasks AS t WHERE t.deleted_at IS NULL ORDER BY t.id ASC",
     ]
    `);
  });

  it("filters STI subtype entity queries by their discriminator", async () => {
    // Given TaskNew and TaskOld rows in the shared tasks table
    await insertTask({ id: 1, type: "NEW", special_new_field: 10 });
    // And the TaskOld must not appear in a TaskNew result
    await insertTask({ id: 2, type: "OLD", special_old_field: 20 });
    // And a TaskNew entity query retains its subtype result type
    const em = newEntityManager();
    const tn = table(TaskNew);
    resetQueryCount();

    // When selecting the STI subtype as entities
    const tasks = await em.query({ from: tn, select: tn });

    // Then the discriminator predicate excludes sibling subtype rows
    expect(tasks).toMatchEntity([{ type: TaskType.New, specialNewField: 10 }]);
    expect(tasks[0]).toBeInstanceOf(TaskNew);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT t.* FROM tasks AS t WHERE t.deleted_at IS NULL AND t.type_id = $1",
     ]
    `);
  });

  it("applies subtype discrimination to reusable STI entity queries", async () => {
    // Given TaskNew and TaskOld rows in the shared tasks table
    await insertTask({ id: 1, type: "NEW", special_new_field: 10 });
    // And the TaskOld is outside the reusable query's subtype
    await insertTask({ id: 2, type: "OLD", special_old_field: 20 });
    // And a reusable query selects TaskNew entities
    const em = newEntityManager();
    const tn = table(TaskNew);
    const newTasks = query({ from: tn, select: tn });

    // When executing the reusable entity query
    const tasks = await em.query(newTasks);

    // Then only TaskNew rows are hydrated
    expect(tasks).toMatchEntity([{ type: TaskType.New, specialNewField: 10 }]);
    expect(tasks[0]).toBeInstanceOf(TaskNew);
  });

  it("applies subtype discrimination to em.execute reads", async () => {
    // Given TaskNew and TaskOld rows in the shared tasks table
    await insertTask({ id: 1, type: "NEW", special_new_field: 10 });
    // And the TaskOld must remain outside the executed TaskNew read
    await insertTask({ id: 2, type: "OLD", special_old_field: 20 });
    // And a TaskNew table supplies entity-mode output
    const em = newEntityManager();
    const tn = table(TaskNew);

    // When executing the STI entity read through em.execute
    const result = await em.execute({ from: tn, select: tn });

    // Then execution reports and hydrates only the matching subtype row
    expect(result.rowCount).toBe(1);
    expect(result.rows).toMatchEntity([{ type: TaskType.New, specialNewField: 10 }]);
    expect(result.rows[0]).toBeInstanceOf(TaskNew);
  });
});
