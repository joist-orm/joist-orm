import { newEmployee } from "src/entities";
import { employee } from "src/resolvers/employee/employeeQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("employee", () => {
  it.withCtx("returns a Employee", async (ctx) => {
    const e = newEmployee(ctx.em);
    const result = await run(ctx, () => ({ id: e.id }));
    expect(result).toMatchEntity(e);
  });
});

const run = makeRunQuery(employee);
