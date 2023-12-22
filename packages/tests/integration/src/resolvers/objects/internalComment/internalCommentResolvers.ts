import { InternalComment } from "src/entities";
import { InternalCommentResolvers } from "src/generated/graphql-types";
import { entityResolver } from "src/resolvers/utils";

export const internalCommentResolvers: InternalCommentResolvers = {
  ...entityResolver(InternalComment, { textInternal: "text" }),
};
