import { Task } from "src/entities";
import { TaskResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const taskResolvers: TaskResolvers = { ...entityResolver(Task) };
