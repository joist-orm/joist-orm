import { newCritic } from "src/entities";
import { criticResolvers } from "src/resolvers/critic/criticResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("criticResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Critic
    const c = newCritic(em);
    // Then we can query it
    const result = await runFields(ctx, c, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(criticResolvers);
const runField = makeRunObjectField(criticResolvers);
