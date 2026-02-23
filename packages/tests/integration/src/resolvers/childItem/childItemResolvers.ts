import { ChildItem } from "src/entities";
import { ChildItemResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const childItemResolvers: ChildItemResolvers = { ...entityResolver(ChildItem) };
