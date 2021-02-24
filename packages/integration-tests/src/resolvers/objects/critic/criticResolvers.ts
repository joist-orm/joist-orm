import { getMetadata } from "joist-orm";
import { Critic } from "src/entities";
import { CriticResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const criticResolvers: CriticResolvers = {
  ...entityResolver(getMetadata(Critic)),
};
