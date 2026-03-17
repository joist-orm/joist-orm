import { newCriticColumn } from "src/entities";
import { criticColumnResolvers } from "src/resolvers/criticColumn/criticColumnResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("criticColumnResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Critic column
    const cc = newCriticColumn(em);
    // Then we can query it
    const result = await runFields(ctx, cc, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(criticColumnResolvers);
const runField = makeRunObjectField(criticColumnResolvers);
