import { newEmployee } from "src/entities";
import { employeeResolvers } from "src/resolvers/employee/employeeResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("employeeResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Employee
    const e = newEmployee(em);
    // Then we can query it
    const result = await runFields(ctx, e, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(employeeResolvers);
const runField = makeRunObjectField(employeeResolvers);
