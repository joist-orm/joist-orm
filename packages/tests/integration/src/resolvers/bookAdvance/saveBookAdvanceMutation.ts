import { BookAdvance } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveBookAdvance: Pick<MutationResolvers, "saveBookAdvance"> = {
  async saveBookAdvance(_, args, ctx) {
    return { bookAdvance: await saveEntity(ctx, BookAdvance, args.input) };
  },
};
