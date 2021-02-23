import { CriticResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { Critic } from "src/entities";

export const criticResolvers: CriticResolvers = {
  ...entityResolver(getMetadata(Critic)),
};
