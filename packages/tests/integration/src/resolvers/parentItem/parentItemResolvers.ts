import { ParentItem } from "src/entities";
import { ParentItemResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const parentItemResolvers: ParentItemResolvers = { ...entityResolver(ParentItem) };
