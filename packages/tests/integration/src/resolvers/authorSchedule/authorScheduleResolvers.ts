import { AuthorSchedule } from "src/entities";
import { AuthorScheduleResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const authorScheduleResolvers: AuthorScheduleResolvers = { ...entityResolver(AuthorSchedule) };
