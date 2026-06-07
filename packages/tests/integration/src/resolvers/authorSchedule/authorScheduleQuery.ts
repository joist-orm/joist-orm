import { AuthorSchedule } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const authorSchedule: Pick<QueryResolvers, "authorSchedule"> = {
  async authorSchedule(_, args, ctx) {
    return ctx.em.load(AuthorSchedule, args.id);
  },
};
