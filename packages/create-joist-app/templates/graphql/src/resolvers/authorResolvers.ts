import { Context } from "../context";
import { Author } from "../entities";

export const authorResolvers = {
  Query: {
    authors: async (_: unknown, __: unknown, ctx: Context) => {
      return ctx.em.find(Author, {});
    },
    author: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      return ctx.em.load(Author, id);
    },
  },
  Mutation: {
    createAuthor: async (
      _: unknown,
      { input }: { input: { firstName: string; lastName?: string } },
      ctx: Context,
    ) => {
      const author = ctx.em.create(Author, input);
      await ctx.em.flush();
      return author;
    },
  },
  Author: {
    fullName: (author: Author) => author.fullName,
    books: (author: Author) => author.books.load(),
    createdAt: (author: Author) => author.createdAt.toISOString(),
    updatedAt: (author: Author) => author.updatedAt.toISOString(),
  },
};
