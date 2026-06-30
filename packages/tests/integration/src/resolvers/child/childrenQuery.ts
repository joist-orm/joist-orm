import { Child } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const children: Pick<QueryResolvers, "children"> = {
  async children(_, args, ctx) {
    return paginate(ctx, Child, args);
  },
};
