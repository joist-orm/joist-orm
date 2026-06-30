import { Tag } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const tags: Pick<QueryResolvers, "tags"> = {
  async tags(_, args, ctx) {
    return paginate(ctx, Tag, args);
  },
};
