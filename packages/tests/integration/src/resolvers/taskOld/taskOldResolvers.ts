import { TaskOld } from "src/entities";
import { TaskOldResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const taskOldResolvers: TaskOldResolvers = { ...entityResolver(TaskOld) };
