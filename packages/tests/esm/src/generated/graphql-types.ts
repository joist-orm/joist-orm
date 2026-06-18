import { type GraphQLResolveInfo, GraphQLScalarType } from "graphql";
import { Temporal } from "joist-orm";
import { CursorPageInfo } from "joist-graphql-resolver-utils/index.js";
import type { Context } from "src/context.js";
import { Author, Book, Color } from "src/entities/index.js";

export interface Resolvers {
  Author: AuthorResolvers;
  Book: BookResolvers;
  ColorDetail: ColorDetailResolvers;
  Mutation: MutationResolvers;
  PageInfo: PageInfoResolvers;
  Query: QueryResolvers;
  AllEnumDetails?: AllEnumDetailsResolvers;
  AuthorsConnection?: AuthorsConnectionResolvers;
  AuthorsEdge?: AuthorsEdgeResolvers;
  BooksConnection?: BooksConnectionResolvers;
  BooksEdge?: BooksEdgeResolvers;
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

export interface PageInfoResolvers {
  endCursor: Resolver<CursorPageInfo, {}, string | null | undefined>;
  hasNextPage: Resolver<CursorPageInfo, {}, boolean>;
  hasPreviousPage: Resolver<CursorPageInfo, {}, boolean>;
  startCursor: Resolver<CursorPageInfo, {}, string | null | undefined>;
  totalCount: Resolver<CursorPageInfo, {}, number>;
}

export interface QueryResolvers {
  author: Resolver<{}, QueryAuthorArgs, Author | null | undefined>;
  authors: Resolver<{}, {}, readonly Author[]>;
  book: Resolver<{}, QueryBookArgs, Book>;
  books: Resolver<{}, QueryBooksArgs, BooksConnection>;
}

export interface AllEnumDetailsResolvers {
  color: Resolver<AllEnumDetails, {}, readonly Color[]>;
}

export interface AuthorsConnectionResolvers {
  edges: Resolver<AuthorsConnection, {}, readonly AuthorsEdge[]>;
  nodes: Resolver<AuthorsConnection, {}, readonly Author[]>;
  pageInfo: Resolver<AuthorsConnection, {}, CursorPageInfo>;
}

export interface AuthorsEdgeResolvers {
  cursor: Resolver<AuthorsEdge, {}, string>;
  node: Resolver<AuthorsEdge, {}, Author>;
}

export interface BooksConnectionResolvers {
  edges: Resolver<BooksConnection, {}, readonly BooksEdge[]>;
  nodes: Resolver<BooksConnection, {}, readonly Book[]>;
  pageInfo: Resolver<BooksConnection, {}, CursorPageInfo>;
}

export interface BooksEdgeResolvers {
  cursor: Resolver<BooksEdge, {}, string>;
  node: Resolver<BooksEdge, {}, Book>;
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
export interface QueryBookArgs {
  id: string;
}
export interface QueryBooksArgs {
  after?: string | null | undefined;
  before?: string | null | undefined;
  filter?: BookFilter | null | undefined;
  first?: number | null | undefined;
  last?: number | null | undefined;
}
export interface AllEnumDetails {
  color: Color[];
}

export interface AuthorsConnection {
  edges: AuthorsEdge[];
  nodes: Author[];
  pageInfo: CursorPageInfo;
}

export interface AuthorsEdge {
  cursor: string;
  node: Author;
}

export interface BooksConnection {
  edges: BooksEdge[];
  nodes: Book[];
  pageInfo: CursorPageInfo;
}

export interface BooksEdge {
  cursor: string;
  node: Book;
}

export interface SaveAuthorResult {
  author: Author;
}

export interface SaveBookResult {
  book: Book;
}

export interface AuthorFilter {
  createdAt?: Temporal.ZonedDateTime[] | null | undefined;
  delete?: boolean[] | null | undefined;
  favoriteColors?: Color[][] | null | undefined;
  firstName?: string[] | null | undefined;
  id?: string[] | null | undefined;
  lastName?: string[] | null | undefined;
  updatedAt?: Temporal.ZonedDateTime[] | null | undefined;
}

export interface BookFilter {
  authorId?: string[] | null | undefined;
  id?: string[] | null | undefined;
  title?: string[] | null | undefined;
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
