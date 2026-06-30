import { employees } from "src/resolvers/employee/employeesQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("employees", () => {
  it.withCtx("returns employees", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(employees);
