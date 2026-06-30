import { Image } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const image: Pick<QueryResolvers, "image"> = {
  async image(_, args, ctx) {
    return ctx.em.load(Image, args.id);
  },
};
