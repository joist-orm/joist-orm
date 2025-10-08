import { Temporal } from "temporal-polyfill"
import { type GraphQLResolveInfo, GraphQLScalarType } from "graphql";
import type { Context } from "src/context.js";
import { Author, Book, Color } from "src/entities/index.js";

export interface Resolvers {
  Author: AuthorResolvers;
  Book: BookResolvers;
  ColorDetail: ColorDetailResolvers;
  Mutation: MutationResolvers;
  Query: QueryResolvers;
  AllEnumDetails?: AllEnumDetailsResolvers;
  SaveAuthorResult?: SaveAuthorResultResolvers;
  SaveBookResult?: SaveBookResultResolvers;
  DateTime: GraphQLScalarType;
}

export type UnionResolvers = {};

export interface AuthorResolvers {
  books: Resolver<Author, {}, readonly Book[]>;
  createdAt: Resolver<Author, {}, Temporal.ZonedDateTime>;
  delete: Resolver<Author, {}, boolean | null | undefined>;
  favoriteColors: Resolver<Author, {}, readonly Color[]>;
  firstName: Resolver<Author, {}, string>;
  id: Resolver<Author, {}, string>;
  lastName: Resolver<Author, {}, string | null | undefined>;
  updatedAt: Resolver<Author, {}, Temporal.ZonedDateTime>;
}

export interface BookResolvers {
  author: Resolver<Book, {}, Author>;
  id: Resolver<Book, {}, string>;
  title: Resolver<Book, {}, string>;
}

export interface ColorDetailResolvers {
  code: Resolver<Color, {}, Color>;
  name: Resolver<Color, {}, string>;
}

export interface MutationResolvers {
  saveAuthor: Resolver<{}, MutationSaveAuthorArgs, SaveAuthorResult>;
  saveBook: Resolver<{}, MutationSaveBookArgs, SaveBookResult>;
}

export interface QueryResolvers {
  author: Resolver<{}, QueryAuthorArgs, Author | null | undefined>;
  authors: Resolver<{}, {}, readonly Author[]>;
}

export interface AllEnumDetailsResolvers {
  color: Resolver<AllEnumDetails, {}, readonly Color[]>;
}

export interface SaveAuthorResultResolvers {
  author: Resolver<SaveAuthorResult, {}, Author>;
}

export interface SaveBookResultResolvers {
  book: Resolver<SaveBookResult, {}, Book>;
}

type MaybePromise<T> = T | Promise<T>;
export type Resolver<R, A, T> = (root: R, args: A, ctx: Context, info: GraphQLResolveInfo) => MaybePromise<T>;

export type SubscriptionResolverFilter<R, A, T> = (
  root: R | undefined,
  args: A,
  ctx: Context,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;
export type SubscriptionResolver<R, A, T> = {
  subscribe: (root: R | undefined, args: A, ctx: Context, info: GraphQLResolveInfo) => AsyncIterator<T>;
};

export interface MutationSaveAuthorArgs {
  input: SaveAuthorInput;
}
export interface MutationSaveBookArgs {
  input: SaveBookInput;
}
export interface QueryAuthorArgs {
  id: string;
}
export interface AllEnumDetails {
  color: Color[];
}

export interface SaveAuthorResult {
  author: Author;
}

export interface SaveBookResult {
  book: Book;
}

export interface SaveAuthorInput {
  delete?: boolean | null | undefined;
  favoriteColors?: Color[] | null | undefined;
  firstName?: string | null | undefined;
  id?: string | null | undefined;
  lastName?: string | null | undefined;
}

export interface SaveBookInput {
  authorId?: string | null | undefined;
  id?: string | null | undefined;
  title?: string | null | undefined;
}

export { Color } from "src/entities/index.js";
