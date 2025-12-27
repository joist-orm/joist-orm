import { AuthorSchedule } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveAuthorSchedule: Pick<MutationResolvers, "saveAuthorSchedule"> = {
  async saveAuthorSchedule(_, args, ctx) {
    return { authorSchedule: await saveEntity(ctx, AuthorSchedule, args.input) };
  },
};
