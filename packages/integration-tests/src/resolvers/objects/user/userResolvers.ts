import { User } from "src/entities";
import { UserResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const userResolvers: UserResolvers = { ...entityResolver(User) };
