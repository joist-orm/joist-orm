import { TaskItem } from "src/entities";
import { TaskItemResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const taskItemResolvers: TaskItemResolvers = { ...entityResolver(TaskItem) };
