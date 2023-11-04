import { Critic } from "src/entities";
import { CriticResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const criticResolvers: CriticResolvers = {
  ...entityResolver(Critic),
};
