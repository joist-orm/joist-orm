import { getMetadata } from "joist-orm";
import { BookAdvance } from "src/entities";
import { BookAdvanceResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/entityResolver";

export const bookAdvanceResolvers: BookAdvanceResolvers = {
  ...entityResolver(getMetadata(BookAdvance)),
};
