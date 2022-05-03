import { AuthorStat } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/mutations/utils";

export const saveAuthorStat: Pick<MutationResolvers, "saveAuthorStat"> = {
  async saveAuthorStat(root, args, ctx) {
    return { authorStat: await saveEntity(ctx, AuthorStat, args.input) };
  },
};
