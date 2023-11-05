import { BookAdvance } from "src/entities";
import { BookAdvanceResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const bookAdvanceResolvers: BookAdvanceResolvers = {
  ...entityResolver(BookAdvance),
};
