import { insertEmployee, insertEmployeeToManagersClosure, select } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { Employee } from "./entities";

describe("Employee", () => {
  it("updates manager closure table rows through recursive collection reactivity", async () => {
    await insertEmployee({ id: 3, name: "Jill" });
    await insertEmployee({ id: 2, name: "Bob", manager_id: 3 });
    await insertEmployee({ id: 1, name: "Fred", manager_id: 2 });
    await insertEmployee({ id: 4, name: "Jan" });
    await insertEmployeeToManagersClosure({ employee_id: 1, manager_id: 1 });
    await insertEmployeeToManagersClosure({ employee_id: 1, manager_id: 2 });
    await insertEmployeeToManagersClosure({ employee_id: 1, manager_id: 3 });
    await insertEmployeeToManagersClosure({ employee_id: 2, manager_id: 2 });
    await insertEmployeeToManagersClosure({ employee_id: 2, manager_id: 3 });
    await insertEmployeeToManagersClosure({ employee_id: 3, manager_id: 3 });
    await insertEmployeeToManagersClosure({ employee_id: 4, manager_id: 4 });

    const em = newEntityManager();
    const [bob, jill, jan] = await em.loadAll(Employee, ["e:2", "e:3", "e:4"]);
    resetQueryCount();

    jan.manager.set(jill);
    bob.manager.set(jan);
    await em.flush();

    const flushQueries = [...queries];
    expect(await select("employee_to_managers_closure")).toMatchObject([
      { employee_id: 1, manager_id: 1 },
      { employee_id: 1, manager_id: 2 },
      { employee_id: 1, manager_id: 3 },
      { employee_id: 2, manager_id: 2 },
      { employee_id: 2, manager_id: 3 },
      { employee_id: 3, manager_id: 3 },
      { employee_id: 4, manager_id: 4 },
      { employee_id: 4, manager_id: 3 },
      { employee_id: 2, manager_id: 4 },
      { employee_id: 1, manager_id: 4 },
    ]);
    expect(flushQueries.map(classifyClosureTableQuery)).toEqual(expectedClosureTableQueries());
  });

  it("batches manager closure table updates for one relation change", async () => {
    await assertBatchesManagerClosureTableUpdatesAcrossRelationChanges(1);
  });

  it("batches manager closure table updates across many relation changes", async () => {
    await assertBatchesManagerClosureTableUpdatesAcrossRelationChanges(100);
  });
});

/** Returns a stable label for SQL statements in the isolated closure-table scenario. */
function classifyClosureTableQuery(sql: string): string {
  if (sql.startsWith("WITH RECURSIVE")) return "recursive reports CTE";
  if (sql === "BEGIN;") return "begin";
  if (sql.startsWith("WITH data AS") && sql.includes("UPDATE employees SET")) return "employees update";
  if (sql.includes("INSERT INTO employee_to_managers_closure")) return "managers closure insert";
  if (sql === "COMMIT;") return "commit";
  return sql;
}

/** Returns the expected batched SQL shape for the isolated closure-table scenario. */
function expectedClosureTableQueries(): string[] {
  return [
    "recursive reports CTE",
    "begin",
    "employees update",
    "managers closure insert",
    "commit",
  ];
}

/** Asserts manager closure updates use the same SQL shape regardless of changed edge count. */
async function assertBatchesManagerClosureTableUpdatesAcrossRelationChanges(employeeCount: number): Promise<void> {
  await insertEmployee({ id: 1, name: "Jill" });
  await insertEmployeeToManagersClosure({ employee_id: 1, manager_id: 1 });
  for (let id = 2; id <= employeeCount + 1; id += 1) {
    await insertEmployee({ id, name: `Employee ${id}` });
    await insertEmployeeToManagersClosure({ employee_id: id, manager_id: id });
  }

  const em = newEntityManager();
  const jill = await em.load(Employee, "e:1");
  const employees = await em.loadAll(
    Employee,
    Array.from({ length: employeeCount }, function employeeId(_unused, index) {
      return `e:${index + 2}`;
    }),
  );
  resetQueryCount();

  employees.forEach(function assignManager(employee) {
    employee.manager.set(jill);
  });
  await em.flush();

  const flushQueries = [...queries];
  expect(await select("employee_to_managers_closure")).toMatchObject([
    { employee_id: 1, manager_id: 1 },
    ...Array.from({ length: employeeCount }, function selfClosureRow(_unused, index) {
      const id = index + 2;
      return { employee_id: id, manager_id: id };
    }),
    ...Array.from({ length: employeeCount }, function managerClosureRow(_unused, index) {
      return { employee_id: index + 2, manager_id: 1 };
    }),
  ]);
  expect(flushQueries.map(classifyClosureTableQuery)).toEqual(expectedClosureTableQueries());
}
