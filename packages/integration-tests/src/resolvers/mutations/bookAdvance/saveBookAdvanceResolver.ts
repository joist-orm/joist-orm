import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntities } from "src/resolvers/mutations/utils";
import { BookAdvance } from "src/entities";

export const saveBookAdvance: Pick<MutationResolvers, "saveBookAdvance"> = {
  async saveBookAdvance(root, args, ctx) {
    const [id] = await saveEntities(ctx, BookAdvance, [args.input]);
    return { bookAdvance: id };
  },
};
