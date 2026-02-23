import { Child } from "src/entities";
import { ChildResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const childResolvers: ChildResolvers = { ...entityResolver(Child) };
