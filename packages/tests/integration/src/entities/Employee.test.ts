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
    expect(flushQueries).toEqual([
      'WITH RECURSIVE e_cte AS (SELECT b.id, b.manager_id FROM employees b WHERE b.manager_id = ANY($1) UNION SELECT r.id, r.manager_id FROM employees r JOIN e_cte ON r.manager_id = e_cte.id) SELECT "e".* FROM employees AS e JOIN e_cte AS e_cte ON e.id = e_cte.id ORDER BY e.id ASC LIMIT $2',
      "BEGIN;",
      "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::timestamp with time zone[]) as updated_at, unnest($3::int[]) as manager_id, unnest($4::timestamptz[]) as __original_updated_at) UPDATE employees SET updated_at = data.updated_at, manager_id = data.manager_id FROM data WHERE employees.id = data.id AND date_trunc('milliseconds', employees.updated_at) = data.__original_updated_at RETURNING employees.id",
      "WITH data AS (SELECT unnest($1::int[]) as employee_id, unnest($2::int[]) as manager_id) INSERT INTO employee_to_managers_closure (employee_id, manager_id) SELECT * FROM data ON CONFLICT (employee_id, manager_id) DO UPDATE SET id = employee_to_managers_closure.id RETURNING id;",
      "COMMIT;",
    ]);
  });

  it.each([1, 100])("batches manager closure table updates across %s relation changes", async (employeeCount) => {
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
      Array.from({ length: employeeCount }, (_, index) => {
        return `e:${index + 2}`;
      }),
    );
    resetQueryCount();

    employees.forEach((employee) => {
      employee.manager.set(jill);
    });
    await em.flush();

    const flushQueries = [...queries];
    expect(await select("employee_to_managers_closure")).toMatchObject([
      { employee_id: 1, manager_id: 1 },
      ...Array.from({ length: employeeCount }, (_, index) => {
        const id = index + 2;
        return { employee_id: id, manager_id: id };
      }),
      ...Array.from({ length: employeeCount }, (_, index) => {
        return { employee_id: index + 2, manager_id: 1 };
      }),
    ]);
    expect(flushQueries).toEqual([
      'WITH RECURSIVE e_cte AS (SELECT b.id, b.manager_id FROM employees b WHERE b.manager_id = ANY($1) UNION SELECT r.id, r.manager_id FROM employees r JOIN e_cte ON r.manager_id = e_cte.id) SELECT "e".* FROM employees AS e JOIN e_cte AS e_cte ON e.id = e_cte.id ORDER BY e.id ASC LIMIT $2',
      "BEGIN;",
      "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::timestamp with time zone[]) as updated_at, unnest($3::int[]) as manager_id, unnest($4::timestamptz[]) as __original_updated_at) UPDATE employees SET updated_at = data.updated_at, manager_id = data.manager_id FROM data WHERE employees.id = data.id AND date_trunc('milliseconds', employees.updated_at) = data.__original_updated_at RETURNING employees.id",
      "WITH data AS (SELECT unnest($1::int[]) as employee_id, unnest($2::int[]) as manager_id) INSERT INTO employee_to_managers_closure (employee_id, manager_id) SELECT * FROM data ON CONFLICT (employee_id, manager_id) DO UPDATE SET id = employee_to_managers_closure.id RETURNING id;",
      "COMMIT;",
    ]);
  });
});
