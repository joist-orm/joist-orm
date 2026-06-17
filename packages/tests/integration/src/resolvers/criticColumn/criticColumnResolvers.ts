import { CriticColumn } from "src/entities";
import { CriticColumnResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const criticColumnResolvers: CriticColumnResolvers = { ...entityResolver(CriticColumn) };
