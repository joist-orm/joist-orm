import { Comment } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveComment: Pick<MutationResolvers, "saveComment"> = {
  async saveComment(_, args, ctx) {
    return { comment: await saveEntity(ctx, Comment, args.input) };
  },
};
