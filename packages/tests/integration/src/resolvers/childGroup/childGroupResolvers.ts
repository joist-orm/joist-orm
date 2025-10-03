import { ChildGroup } from "src/entities";
import { ChildGroupResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const childGroupResolvers: ChildGroupResolvers = { ...entityResolver(ChildGroup) };
