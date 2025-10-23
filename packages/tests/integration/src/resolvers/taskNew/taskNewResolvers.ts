import { TaskNew } from "src/entities";
import { TaskNewResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const taskNewResolvers: TaskNewResolvers = { ...entityResolver(TaskNew) };
