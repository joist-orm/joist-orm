import { Employee } from "src/entities";
import type { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveEmployee: Pick<MutationResolvers, "saveEmployee"> = {
  async saveEmployee(_, args, ctx) {
    return { employee: await saveEntity(ctx, Employee, args.input) };
  },
};
