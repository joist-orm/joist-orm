import { BookAdvanceResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";
import { getMetadata } from "joist-orm";
import { BookAdvance } from "src/entities";

export const bookAdvanceResolvers: BookAdvanceResolvers = {
  ...entityResolver(getMetadata(BookAdvance)),
};
