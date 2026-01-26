import { Context } from "../context";
import { Author, Book } from "../entities";

export const bookResolvers = {
  Query: {
    books: async (_: unknown, __: unknown, ctx: Context) => {
      return ctx.em.find(Book, {});
    },
    book: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      return ctx.em.load(Book, id);
    },
  },
  Mutation: {
    createBook: async (
      _: unknown,
      { input }: { input: { title: string; authorId: string } },
      ctx: Context,
    ) => {
      const author = await ctx.em.load(Author, input.authorId);
      const book = ctx.em.create(Book, { title: input.title, author });
      await ctx.em.flush();
      return book;
    },
  },
  Book: {
    author: (book: Book) => book.author.load(),
    createdAt: (book: Book) => book.createdAt.toISOString(),
    updatedAt: (book: Book) => book.updatedAt.toISOString(),
  },
};
