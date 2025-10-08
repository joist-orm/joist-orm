import { Book } from "src/entities/index.js";
import type { BookResolvers } from "src/generated/graphql-types.js";
import { entityResolver } from "src/resolvers/utils.js";

export const bookResolvers: BookResolvers = { ...entityResolver(Book) };
