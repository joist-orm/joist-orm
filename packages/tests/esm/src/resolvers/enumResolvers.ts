import { Colors } from "src/entities/index.js";
import type { Resolvers } from "src/generated/graphql-types.js";

type EnumDetails = "ColorDetail";

export const enumResolvers: Pick<Resolvers, EnumDetails> = {
  ColorDetail: { code: (root) => root, name: (root) => Colors.getByCode(root).name },
};
