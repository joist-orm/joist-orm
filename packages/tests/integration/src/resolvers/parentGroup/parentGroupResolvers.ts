import { ParentGroup } from "src/entities";
import { ParentGroupResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const parentGroupResolvers: ParentGroupResolvers = { ...entityResolver(ParentGroup) };
