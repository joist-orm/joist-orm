import { Publisher } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const publishers: Pick<QueryResolvers, "publishers"> = {
  async publishers(_, args, ctx) {
    return paginate(ctx, Publisher, args);
  },
};
