import { Comment } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const saveComment: Pick<MutationResolvers, "saveComment"> = {
  async saveComment(root, args, ctx) {
    const [id] = await saveEntities(ctx, Comment, [args.input]);
    return { comment: id };
  },
};
