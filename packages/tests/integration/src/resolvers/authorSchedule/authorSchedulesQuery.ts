import { AuthorSchedule } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const authorSchedules: Pick<QueryResolvers, "authorSchedules"> = {
  async authorSchedules(_, args, ctx) {
    return paginate(ctx, AuthorSchedule, args);
  },
};
