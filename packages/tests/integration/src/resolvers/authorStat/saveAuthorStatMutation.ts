import { AuthorStat } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveAuthorStat: Pick<MutationResolvers, "saveAuthorStat"> = {
  async saveAuthorStat(_, args, ctx) {
    return { authorStat: await saveEntity(ctx, AuthorStat, args.input) };
  },
};
