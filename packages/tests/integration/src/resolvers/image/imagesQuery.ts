import { Image } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";
import { paginate } from "src/resolvers/utils";

export const images: Pick<QueryResolvers, "images"> = {
  async images(_, args, ctx) {
    return paginate(ctx, Image, args);
  },
};
