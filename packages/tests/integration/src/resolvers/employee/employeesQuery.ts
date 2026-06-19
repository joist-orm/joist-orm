import { Employee } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const employees: Pick<QueryResolvers, "employees"> = {
  async employees(_, args, ctx) {
    return paginate(ctx, Employee, args);
  },
};
