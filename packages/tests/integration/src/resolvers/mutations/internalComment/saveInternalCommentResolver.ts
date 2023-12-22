import { InternalComment } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";

export const saveInternalComment: Pick<MutationResolvers, "saveInternalComment"> = {
  async saveInternalComment(root, args, ctx) {
    const [id] = await saveEntities(ctx, InternalComment, [args.input]);
    return { internalComment: id };
  },
};
