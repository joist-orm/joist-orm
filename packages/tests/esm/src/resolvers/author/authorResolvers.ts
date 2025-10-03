import { Author } from "src/entities/index.js";
import type { AuthorResolvers } from "src/generated/graphql-types.js";
import { entityResolver } from "src/resolvers/utils.js";

export const authorResolvers: AuthorResolvers = { ...entityResolver(Author) };
