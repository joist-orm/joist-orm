import { ReviewComment } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveReviewComment: Pick<MutationResolvers, "saveReviewComment"> = {
  async saveReviewComment(root, args, ctx) {
    return { reviewComment: await saveEntity(ctx, ReviewComment, args.input) };
  },
};
