import { type GraphQLResolveInfo, GraphQLScalarType } from "graphql";
import { LimitPageInfo } from "joist-graphql-resolver-utils";
import type { Context } from "src/context";
import {
  AdminUser,
  AdvanceStatus,
  Author,
  AuthorSchedule,
  AuthorStat,
  Book,
  BookAdvance,
  BookRange,
  BookReview,
  Child,
  ChildGroup,
  ChildItem,
  Color,
  Comment,
  Critic,
  CriticColumn,
  FavoriteShape,
  Image,
  ImageType,
  LargePublisher,
  ParentGroup,
  ParentItem,
  Publisher,
  PublisherGroup,
  PublisherSize,
  PublisherType,
  SmallPublisher,
  SmallPublisherGroup,
  Tag,
  Task,
  TaskItem,
  TaskNew,
  TaskOld,
  TaskType,
  User,
} from "src/entities";

export interface Resolvers {
  AdminUser: AdminUserResolvers;
  AdvanceStatusDetail: AdvanceStatusDetailResolvers;
  Author: AuthorResolvers;
  AuthorSchedule: AuthorScheduleResolvers;
  AuthorStat: AuthorStatResolvers;
  Book: BookResolvers;
  BookAdvance: BookAdvanceResolvers;
  BookRangeDetail: BookRangeDetailResolvers;
  BookReview: BookReviewResolvers;
  Child: ChildResolvers;
  ChildGroup: ChildGroupResolvers;
  ChildItem: ChildItemResolvers;
  ColorDetail: ColorDetailResolvers;
  Comment: CommentResolvers;
  Critic: CriticResolvers;
  CriticColumn: CriticColumnResolvers;
  Image: ImageResolvers;
  ImageTypeDetail: ImageTypeDetailResolvers;
  LargePublisher: LargePublisherResolvers;
  Mutation: MutationResolvers;
  PageInfo: PageInfoResolvers;
  ParentGroup: ParentGroupResolvers;
  ParentItem: ParentItemResolvers;
  Publisher: PublisherResolvers;
  PublisherGroup: PublisherGroupResolvers;
  PublisherSizeDetail: PublisherSizeDetailResolvers;
  PublisherTypeDetail: PublisherTypeDetailResolvers;
  Query: QueryResolvers;
  SmallPublisher: SmallPublisherResolvers;
  SmallPublisherGroup: SmallPublisherGroupResolvers;
  Tag: TagResolvers;
  Task: TaskResolvers;
  TaskItem: TaskItemResolvers;
  TaskNew: TaskNewResolvers;
  TaskOld: TaskOldResolvers;
  TaskTypeDetail: TaskTypeDetailResolvers;
  User: UserResolvers;
  AdminUsersPage?: AdminUsersPageResolvers;
  AllEnumDetails?: AllEnumDetailsResolvers;
  AuthorSchedulesPage?: AuthorSchedulesPageResolvers;
  AuthorStatsPage?: AuthorStatsPageResolvers;
  AuthorsPage?: AuthorsPageResolvers;
  BookAdvancesPage?: BookAdvancesPageResolvers;
  BookReviewsPage?: BookReviewsPageResolvers;
  BooksPage?: BooksPageResolvers;
  ChildGroupsPage?: ChildGroupsPageResolvers;
  ChildItemsPage?: ChildItemsPageResolvers;
  ChildrenPage?: ChildrenPageResolvers;
  CommentsPage?: CommentsPageResolvers;
  CriticColumnsPage?: CriticColumnsPageResolvers;
  CriticsPage?: CriticsPageResolvers;
  ImagesPage?: ImagesPageResolvers;
  LargePublishersPage?: LargePublishersPageResolvers;
  NewTask?: NewTaskResolvers;
  OldTask?: OldTaskResolvers;
  ParentGroupsPage?: ParentGroupsPageResolvers;
  ParentItemsPage?: ParentItemsPageResolvers;
  PublisherGroupsPage?: PublisherGroupsPageResolvers;
  PublishersPage?: PublishersPageResolvers;
  SaveAuthorResult?: SaveAuthorResultResolvers;
  SaveAuthorStatResult?: SaveAuthorStatResultResolvers;
  SaveBookAdvanceResult?: SaveBookAdvanceResultResolvers;
  SaveBookResult?: SaveBookResultResolvers;
  SaveBookReviewResult?: SaveBookReviewResultResolvers;
  SaveCommentResult?: SaveCommentResultResolvers;
  SaveCriticResult?: SaveCriticResultResolvers;
  SaveImageResult?: SaveImageResultResolvers;
  SaveLargePublisherResult?: SaveLargePublisherResultResolvers;
  SaveNewTaskResult?: SaveNewTaskResultResolvers;
  SaveOldTaskResult?: SaveOldTaskResultResolvers;
  SavePublisherGroupResult?: SavePublisherGroupResultResolvers;
  SavePublisherResult?: SavePublisherResultResolvers;
  SaveSmallPublisherResult?: SaveSmallPublisherResultResolvers;
  SaveTagResult?: SaveTagResultResolvers;
  SaveTaskItemResult?: SaveTaskItemResultResolvers;
  SaveTaskNewResult?: SaveTaskNewResultResolvers;
  SaveTaskOldResult?: SaveTaskOldResultResolvers;
  SaveTaskResult?: SaveTaskResultResolvers;
  SaveUserResult?: SaveUserResultResolvers;
  SmallPublisherGroupsPage?: SmallPublisherGroupsPageResolvers;
  SmallPublishersPage?: SmallPublishersPageResolvers;
  TagsPage?: TagsPageResolvers;
  TaskItemsPage?: TaskItemsPageResolvers;
  TaskNewsPage?: TaskNewsPageResolvers;
  TaskOldsPage?: TaskOldsPageResolvers;
  TasksPage?: TasksPageResolvers;
  UsersPage?: UsersPageResolvers;
  BigInt: GraphQLScalarType;
  Date: GraphQLScalarType;
  DateTime: GraphQLScalarType;
}

export type UnionResolvers = {
  CommentParent: { __resolveType(o: Author | Book | BookReview | Publisher | TaskOld): string };
  UserFavoritePublisher: { __resolveType(o: LargePublisher | SmallPublisher): string };
};

export interface AdminUserResolvers {
  children: Resolver<AdminUser, {}, readonly User[]>;
  parents: Resolver<AdminUser, {}, readonly User[]>;
}

export interface AdvanceStatusDetailResolvers {
  code: Resolver<AdvanceStatus, {}, AdvanceStatus>;
  name: Resolver<AdvanceStatus, {}, string>;
}

export interface AuthorResolvers {
  age: Resolver<Author, {}, number | null | undefined>;
  bookComments: Resolver<Author, {}, string | null | undefined>;
  books: Resolver<Author, {}, readonly Book[]>;
  createdAt: Resolver<Author, {}, Date>;
  currentDraftBook: Resolver<Author, {}, Book | null | undefined>;
  deletedAt: Resolver<Author, {}, Date | null | undefined>;
  favoriteBook: Resolver<Author, {}, Book | null | undefined>;
  favoriteColors: Resolver<Author, {}, readonly Color[]>;
  favoriteShape: Resolver<Author, {}, FavoriteShape | null | undefined>;
  firstName: Resolver<Author, {}, string>;
  fullName: Resolver<Author, {}, string | null | undefined>;
  graduated: Resolver<Author, {}, Date | null | undefined>;
  graphqlOnlyField: Resolver<Author, AuthorGraphqlOnlyFieldArgs, number>;
  id: Resolver<Author, {}, string>;
  image: Resolver<Author, {}, Image | null | undefined>;
  imageFileName: Resolver<Author, {}, string | null | undefined>;
  initials: Resolver<Author, {}, string>;
  isFunny: Resolver<Author, {}, boolean>;
  isPopular: Resolver<Author, {}, boolean | null | undefined>;
  lastName: Resolver<Author, {}, string | null | undefined>;
  menteeNames: Resolver<Author, {}, string | null | undefined>;
  mentees: Resolver<Author, {}, readonly Author[]>;
  menteesClosure: Resolver<Author, {}, readonly Author[]>;
  mentor: Resolver<Author, {}, Author | null | undefined>;
  mentorNames: Resolver<Author, {}, string | null | undefined>;
  mentorsClosure: Resolver<Author, {}, readonly Author[]>;
  nickNames: Resolver<Author, {}, readonly string[] | null | undefined>;
  numberOfAtoms: Resolver<Author, {}, bigint | null | undefined>;
  numberOfBooks: Resolver<Author, {}, number>;
  numberOfPublicReviews: Resolver<Author, {}, number | null | undefined>;
  numberOfPublicReviews2: Resolver<Author, {}, number | null | undefined>;
  publisher: Resolver<Author, {}, Publisher | null | undefined>;
  rangeOfBooks: Resolver<Author, {}, BookRange | null | undefined>;
  ssn: Resolver<Author, {}, string | null | undefined>;
  tags: Resolver<Author, {}, readonly Tag[]>;
  tagsOfAllBooks: Resolver<Author, {}, string>;
  tasks: Resolver<Author, {}, readonly Task[]>;
  updatedAt: Resolver<Author, {}, Date>;
  userOneToOne: Resolver<Author, {}, User | null | undefined>;
  wasEverPopular: Resolver<Author, {}, boolean | null | undefined>;
}

export interface AuthorScheduleResolvers {
  author: Resolver<AuthorSchedule, {}, Author>;
  createdAt: Resolver<AuthorSchedule, {}, Date>;
  id: Resolver<AuthorSchedule, {}, string>;
  overview: Resolver<AuthorSchedule, {}, string | null | undefined>;
  updatedAt: Resolver<AuthorSchedule, {}, Date>;
}

export interface AuthorStatResolvers {
  bigint: Resolver<AuthorStat, {}, bigint>;
  bigserial: Resolver<AuthorStat, {}, bigint>;
  createdAt: Resolver<AuthorStat, {}, Date>;
  decimal: Resolver<AuthorStat, {}, number>;
  doublePrecision: Resolver<AuthorStat, {}, number>;
  id: Resolver<AuthorStat, {}, string>;
  integer: Resolver<AuthorStat, {}, number>;
  nullableInteger: Resolver<AuthorStat, {}, number | null | undefined>;
  nullableText: Resolver<AuthorStat, {}, string | null | undefined>;
  real: Resolver<AuthorStat, {}, number>;
  serial: Resolver<AuthorStat, {}, number>;
  smallint: Resolver<AuthorStat, {}, number>;
  smallserial: Resolver<AuthorStat, {}, number>;
  updatedAt: Resolver<AuthorStat, {}, Date>;
}

export interface BookResolvers {
  acknowledgements: Resolver<Book, {}, string | null | undefined>;
  advances: Resolver<Book, {}, readonly BookAdvance[]>;
  author: Resolver<Book, {}, Author>;
  authorsNickNames: Resolver<Book, {}, string | null | undefined>;
  comments: Resolver<Book, {}, readonly Comment[]>;
  createdAt: Resolver<Book, {}, Date>;
  currentDraftAuthor: Resolver<Book, {}, Author | null | undefined>;
  deletedAt: Resolver<Book, {}, Date | null | undefined>;
  id: Resolver<Book, {}, string>;
  image: Resolver<Book, {}, Image | null | undefined>;
  notes: Resolver<Book, {}, string | null | undefined>;
  order: Resolver<Book, {}, number | null | undefined>;
  reviews: Resolver<Book, {}, readonly BookReview[]>;
  search: Resolver<Book, {}, string | null | undefined>;
  tags: Resolver<Book, {}, readonly Tag[]>;
  title: Resolver<Book, {}, string>;
  updatedAt: Resolver<Book, {}, Date>;
}

export interface BookAdvanceResolvers {
  book: Resolver<BookAdvance, {}, Book>;
  createdAt: Resolver<BookAdvance, {}, Date>;
  id: Resolver<BookAdvance, {}, string>;
  publisher: Resolver<BookAdvance, {}, Publisher>;
  status: Resolver<BookAdvance, {}, AdvanceStatus>;
  updatedAt: Resolver<BookAdvance, {}, Date>;
}

export interface BookRangeDetailResolvers {
  code: Resolver<BookRange, {}, BookRange>;
  name: Resolver<BookRange, {}, string>;
}

export interface BookReviewResolvers {
  book: Resolver<BookReview, {}, Book>;
  comment: Resolver<BookReview, {}, Comment | null | undefined>;
  createdAt: Resolver<BookReview, {}, Date>;
  id: Resolver<BookReview, {}, string>;
  isPublic: Resolver<BookReview, {}, boolean>;
  isTest: Resolver<BookReview, {}, boolean>;
  isTestChain: Resolver<BookReview, {}, boolean>;
  rating: Resolver<BookReview, {}, number>;
  tags: Resolver<BookReview, {}, readonly Tag[]>;
  updatedAt: Resolver<BookReview, {}, Date>;
}

export interface ChildResolvers {
  createdAt: Resolver<Child, {}, Date>;
  id: Resolver<Child, {}, string>;
  name: Resolver<Child, {}, string | null | undefined>;
  updatedAt: Resolver<Child, {}, Date>;
}

export interface ChildGroupResolvers {
  childGroup: Resolver<ChildGroup, {}, ChildGroup | null | undefined>;
  createdAt: Resolver<ChildGroup, {}, Date>;
  id: Resolver<ChildGroup, {}, string>;
  name: Resolver<ChildGroup, {}, string | null | undefined>;
  parentGroup: Resolver<ChildGroup, {}, ParentGroup | null | undefined>;
  updatedAt: Resolver<ChildGroup, {}, Date>;
}

export interface ChildItemResolvers {
  childGroup: Resolver<ChildItem, {}, ChildGroup | null | undefined>;
  createdAt: Resolver<ChildItem, {}, Date>;
  id: Resolver<ChildItem, {}, string>;
  name: Resolver<ChildItem, {}, string | null | undefined>;
  parentItem: Resolver<ChildItem, {}, ParentItem | null | undefined>;
  updatedAt: Resolver<ChildItem, {}, Date>;
}

export interface ColorDetailResolvers {
  code: Resolver<Color, {}, Color>;
  name: Resolver<Color, {}, string>;
}

export interface CommentResolvers {
  createdAt: Resolver<Comment, {}, Date>;
  id: Resolver<Comment, {}, string>;
  likedByUsers: Resolver<Comment, {}, readonly User[]>;
  parent: Resolver<Comment, {}, CommentParent | null | undefined>;
  parentTags: Resolver<Comment, {}, string>;
  text: Resolver<Comment, {}, string | null | undefined>;
  updatedAt: Resolver<Comment, {}, Date>;
  user: Resolver<Comment, {}, User | null | undefined>;
}

export interface CriticResolvers {
  createdAt: Resolver<Critic, {}, Date>;
  favoriteLargePublisher: Resolver<Critic, {}, LargePublisher | null | undefined>;
  group: Resolver<Critic, {}, PublisherGroup | null | undefined>;
  id: Resolver<Critic, {}, string>;
  name: Resolver<Critic, {}, string>;
  updatedAt: Resolver<Critic, {}, Date>;
}

export interface CriticColumnResolvers {
  createdAt: Resolver<CriticColumn, {}, Date>;
  critic: Resolver<CriticColumn, {}, Critic | null | undefined>;
  id: Resolver<CriticColumn, {}, string>;
  name: Resolver<CriticColumn, {}, string | null | undefined>;
  updatedAt: Resolver<CriticColumn, {}, Date>;
}

export interface ImageResolvers {
  author: Resolver<Image, {}, Author | null | undefined>;
  book: Resolver<Image, {}, Book | null | undefined>;
  createdAt: Resolver<Image, {}, Date>;
  fileName: Resolver<Image, {}, string>;
  id: Resolver<Image, {}, string>;
  publisher: Resolver<Image, {}, Publisher | null | undefined>;
  type: Resolver<Image, {}, ImageType>;
  updatedAt: Resolver<Image, {}, Date>;
}

export interface ImageTypeDetailResolvers {
  code: Resolver<ImageType, {}, ImageType>;
  name: Resolver<ImageType, {}, string>;
  nickname: Resolver<ImageType, {}, string>;
  sortOrder: Resolver<ImageType, {}, number>;
  visible: Resolver<ImageType, {}, boolean>;
}

export interface LargePublisherResolvers {
  authors: Resolver<LargePublisher, {}, readonly Author[]>;
  baseAsyncDefault: Resolver<LargePublisher, {}, string>;
  baseSyncDefault: Resolver<LargePublisher, {}, string | null | undefined>;
  bookAdvances: Resolver<LargePublisher, {}, readonly BookAdvance[]>;
  comments: Resolver<LargePublisher, {}, readonly Comment[]>;
  country: Resolver<LargePublisher, {}, string | null | undefined>;
  createdAt: Resolver<LargePublisher, {}, Date>;
  critics: Resolver<LargePublisher, {}, readonly Critic[]>;
  deletedAt: Resolver<LargePublisher, {}, Date | null | undefined>;
  group: Resolver<LargePublisher, {}, PublisherGroup | null | undefined>;
  hugeNumber: Resolver<LargePublisher, {}, number | null | undefined>;
  id: Resolver<LargePublisher, {}, string>;
  images: Resolver<LargePublisher, {}, readonly Image[]>;
  latitude: Resolver<LargePublisher, {}, number | null | undefined>;
  longitude: Resolver<LargePublisher, {}, number | null | undefined>;
  name: Resolver<LargePublisher, {}, string>;
  numberOfBookReviews: Resolver<LargePublisher, {}, number | null | undefined>;
  rating: Resolver<LargePublisher, {}, number>;
  sharedColumn: Resolver<LargePublisher, {}, string | null | undefined>;
  size: Resolver<LargePublisher, {}, PublisherSize | null | undefined>;
  tags: Resolver<LargePublisher, {}, readonly Tag[]>;
  tasks: Resolver<LargePublisher, {}, readonly Task[]>;
  type: Resolver<LargePublisher, {}, PublisherType>;
  updatedAt: Resolver<LargePublisher, {}, Date>;
}

export interface MutationResolvers {
  saveAuthor: Resolver<{}, MutationSaveAuthorArgs, SaveAuthorResult>;
  saveAuthorStat: Resolver<{}, MutationSaveAuthorStatArgs, SaveAuthorStatResult>;
  saveBook: Resolver<{}, MutationSaveBookArgs, SaveBookResult>;
  saveBookAdvance: Resolver<{}, MutationSaveBookAdvanceArgs, SaveBookAdvanceResult>;
  saveBookReview: Resolver<{}, MutationSaveBookReviewArgs, SaveBookReviewResult>;
  saveComment: Resolver<{}, MutationSaveCommentArgs, SaveCommentResult>;
  saveCritic: Resolver<{}, MutationSaveCriticArgs, SaveCriticResult>;
  saveImage: Resolver<{}, MutationSaveImageArgs, SaveImageResult>;
  saveLargePublisher: Resolver<{}, MutationSaveLargePublisherArgs, SaveLargePublisherResult>;
  saveNewTask: Resolver<{}, MutationSaveNewTaskArgs, SaveNewTaskResult>;
  saveOldTask: Resolver<{}, MutationSaveOldTaskArgs, SaveOldTaskResult>;
  savePublisher: Resolver<{}, MutationSavePublisherArgs, SavePublisherResult>;
  savePublisherGroup: Resolver<{}, MutationSavePublisherGroupArgs, SavePublisherGroupResult>;
  saveSmallPublisher: Resolver<{}, MutationSaveSmallPublisherArgs, SaveSmallPublisherResult>;
  saveTag: Resolver<{}, MutationSaveTagArgs, SaveTagResult>;
  saveTask: Resolver<{}, MutationSaveTaskArgs, SaveTaskResult>;
  saveTaskItem: Resolver<{}, MutationSaveTaskItemArgs, SaveTaskItemResult>;
  saveTaskNew: Resolver<{}, MutationSaveTaskNewArgs, SaveTaskNewResult>;
  saveTaskOld: Resolver<{}, MutationSaveTaskOldArgs, SaveTaskOldResult>;
  saveUser: Resolver<{}, MutationSaveUserArgs, SaveUserResult>;
}

export interface PageInfoResolvers {
  currentPage: Resolver<LimitPageInfo, {}, number | null | undefined>;
  hasNextPage: Resolver<LimitPageInfo, {}, boolean>;
  hasPreviousPage: Resolver<LimitPageInfo, {}, boolean>;
  nextPage: Resolver<LimitPageInfo, {}, number | null | undefined>;
  totalCount: Resolver<LimitPageInfo, {}, number>;
}

export interface ParentGroupResolvers {
  createdAt: Resolver<ParentGroup, {}, Date>;
  id: Resolver<ParentGroup, {}, string>;
  name: Resolver<ParentGroup, {}, string | null | undefined>;
  updatedAt: Resolver<ParentGroup, {}, Date>;
}

export interface ParentItemResolvers {
  createdAt: Resolver<ParentItem, {}, Date>;
  id: Resolver<ParentItem, {}, string>;
  name: Resolver<ParentItem, {}, string | null | undefined>;
  parentGroup: Resolver<ParentItem, {}, ParentGroup | null | undefined>;
  updatedAt: Resolver<ParentItem, {}, Date>;
}

export interface PublisherResolvers {
  authors: Resolver<Publisher, {}, readonly Author[]>;
  baseAsyncDefault: Resolver<Publisher, {}, string>;
  baseSyncDefault: Resolver<Publisher, {}, string | null | undefined>;
  bookAdvances: Resolver<Publisher, {}, readonly BookAdvance[]>;
  createdAt: Resolver<Publisher, {}, Date>;
  deletedAt: Resolver<Publisher, {}, Date | null | undefined>;
  group: Resolver<Publisher, {}, PublisherGroup | null | undefined>;
  hugeNumber: Resolver<Publisher, {}, number | null | undefined>;
  id: Resolver<Publisher, {}, string>;
  images: Resolver<Publisher, {}, readonly Image[]>;
  latitude: Resolver<Publisher, {}, number | null | undefined>;
  longitude: Resolver<Publisher, {}, number | null | undefined>;
  name: Resolver<Publisher, {}, string>;
  numberOfBookReviews: Resolver<Publisher, {}, number | null | undefined>;
  rating: Resolver<Publisher, {}, number | null | undefined>;
  size: Resolver<Publisher, {}, PublisherSize | null | undefined>;
  tags: Resolver<Publisher, {}, readonly Tag[]>;
  tasks: Resolver<Publisher, {}, readonly Task[]>;
  type: Resolver<Publisher, {}, PublisherType | null | undefined>;
  updatedAt: Resolver<Publisher, {}, Date>;
}

export interface PublisherGroupResolvers {
  createdAt: Resolver<PublisherGroup, {}, Date>;
  critics: Resolver<PublisherGroup, {}, readonly Critic[]>;
  id: Resolver<PublisherGroup, {}, string>;
  name: Resolver<PublisherGroup, {}, string | null | undefined>;
  numberOfBookReviews: Resolver<PublisherGroup, {}, number | null | undefined>;
  numberOfBookReviewsFormatted: Resolver<PublisherGroup, {}, string>;
  publishers: Resolver<PublisherGroup, {}, readonly Publisher[]>;
  updatedAt: Resolver<PublisherGroup, {}, Date>;
}

export interface PublisherSizeDetailResolvers {
  code: Resolver<PublisherSize, {}, PublisherSize>;
  name: Resolver<PublisherSize, {}, string>;
}

export interface PublisherTypeDetailResolvers {
  code: Resolver<PublisherType, {}, PublisherType>;
  name: Resolver<PublisherType, {}, string>;
}

export interface QueryResolvers {
  adminUser: Resolver<{}, QueryAdminUserArgs, AdminUser>;
  adminUsers: Resolver<{}, QueryAdminUsersArgs, AdminUsersPage>;
  author: Resolver<{}, QueryAuthorArgs, Author>;
  authorSchedule: Resolver<{}, QueryAuthorScheduleArgs, AuthorSchedule>;
  authorSchedules: Resolver<{}, QueryAuthorSchedulesArgs, AuthorSchedulesPage>;
  authorStat: Resolver<{}, QueryAuthorStatArgs, AuthorStat>;
  authorStats: Resolver<{}, QueryAuthorStatsArgs, AuthorStatsPage>;
  authors: Resolver<{}, QueryAuthorsArgs, AuthorsPage>;
  book: Resolver<{}, QueryBookArgs, Book>;
  bookAdvance: Resolver<{}, QueryBookAdvanceArgs, BookAdvance>;
  bookAdvances: Resolver<{}, QueryBookAdvancesArgs, BookAdvancesPage>;
  bookReview: Resolver<{}, QueryBookReviewArgs, BookReview>;
  bookReviews: Resolver<{}, QueryBookReviewsArgs, BookReviewsPage>;
  books: Resolver<{}, QueryBooksArgs, BooksPage>;
  child: Resolver<{}, QueryChildArgs, Child>;
  childGroup: Resolver<{}, QueryChildGroupArgs, ChildGroup>;
  childGroups: Resolver<{}, QueryChildGroupsArgs, ChildGroupsPage>;
  childItem: Resolver<{}, QueryChildItemArgs, ChildItem>;
  childItems: Resolver<{}, QueryChildItemsArgs, ChildItemsPage>;
  children: Resolver<{}, QueryChildrenArgs, ChildrenPage>;
  comment: Resolver<{}, QueryCommentArgs, Comment>;
  comments: Resolver<{}, QueryCommentsArgs, CommentsPage>;
  critic: Resolver<{}, QueryCriticArgs, Critic>;
  criticColumn: Resolver<{}, QueryCriticColumnArgs, CriticColumn>;
  criticColumns: Resolver<{}, QueryCriticColumnsArgs, CriticColumnsPage>;
  critics: Resolver<{}, QueryCriticsArgs, CriticsPage>;
  image: Resolver<{}, QueryImageArgs, Image>;
  images: Resolver<{}, QueryImagesArgs, ImagesPage>;
  largePublisher: Resolver<{}, QueryLargePublisherArgs, LargePublisher>;
  largePublishers: Resolver<{}, QueryLargePublishersArgs, LargePublishersPage>;
  parentGroup: Resolver<{}, QueryParentGroupArgs, ParentGroup>;
  parentGroups: Resolver<{}, QueryParentGroupsArgs, ParentGroupsPage>;
  parentItem: Resolver<{}, QueryParentItemArgs, ParentItem>;
  parentItems: Resolver<{}, QueryParentItemsArgs, ParentItemsPage>;
  publisher: Resolver<{}, QueryPublisherArgs, Publisher>;
  publisherGroup: Resolver<{}, QueryPublisherGroupArgs, PublisherGroup>;
  publisherGroups: Resolver<{}, QueryPublisherGroupsArgs, PublisherGroupsPage>;
  publishers: Resolver<{}, QueryPublishersArgs, PublishersPage>;
  smallPublisher: Resolver<{}, QuerySmallPublisherArgs, SmallPublisher>;
  smallPublisherGroup: Resolver<{}, QuerySmallPublisherGroupArgs, SmallPublisherGroup>;
  smallPublisherGroups: Resolver<{}, QuerySmallPublisherGroupsArgs, SmallPublisherGroupsPage>;
  smallPublishers: Resolver<{}, QuerySmallPublishersArgs, SmallPublishersPage>;
  tag: Resolver<{}, QueryTagArgs, Tag>;
  tags: Resolver<{}, QueryTagsArgs, TagsPage>;
  task: Resolver<{}, QueryTaskArgs, Task>;
  taskItem: Resolver<{}, QueryTaskItemArgs, TaskItem>;
  taskItems: Resolver<{}, QueryTaskItemsArgs, TaskItemsPage>;
  taskNew: Resolver<{}, QueryTaskNewArgs, TaskNew>;
  taskNews: Resolver<{}, QueryTaskNewsArgs, TaskNewsPage>;
  taskOld: Resolver<{}, QueryTaskOldArgs, TaskOld>;
  taskOlds: Resolver<{}, QueryTaskOldsArgs, TaskOldsPage>;
  tasks: Resolver<{}, QueryTasksArgs, TasksPage>;
  user: Resolver<{}, QueryUserArgs, User>;
  users: Resolver<{}, QueryUsersArgs, UsersPage>;
}

export interface SmallPublisherResolvers {
  allAuthorNames: Resolver<SmallPublisher, {}, string | null | undefined>;
  authors: Resolver<SmallPublisher, {}, readonly Author[]>;
  baseAsyncDefault: Resolver<SmallPublisher, {}, string>;
  baseSyncDefault: Resolver<SmallPublisher, {}, string | null | undefined>;
  bookAdvances: Resolver<SmallPublisher, {}, readonly BookAdvance[]>;
  city: Resolver<SmallPublisher, {}, string | null | undefined>;
  comments: Resolver<SmallPublisher, {}, readonly Comment[]>;
  createdAt: Resolver<SmallPublisher, {}, Date>;
  deletedAt: Resolver<SmallPublisher, {}, Date | null | undefined>;
  group: Resolver<SmallPublisher, {}, PublisherGroup | null | undefined>;
  hugeNumber: Resolver<SmallPublisher, {}, number | null | undefined>;
  id: Resolver<SmallPublisher, {}, string>;
  images: Resolver<SmallPublisher, {}, readonly Image[]>;
  latitude: Resolver<SmallPublisher, {}, number | null | undefined>;
  longitude: Resolver<SmallPublisher, {}, number | null | undefined>;
  name: Resolver<SmallPublisher, {}, string>;
  numberOfBookReviews: Resolver<SmallPublisher, {}, number | null | undefined>;
  rating: Resolver<SmallPublisher, {}, number | null | undefined>;
  selfReferential: Resolver<SmallPublisher, {}, SmallPublisher | null | undefined>;
  sharedColumn: Resolver<SmallPublisher, {}, string | null | undefined>;
  size: Resolver<SmallPublisher, {}, PublisherSize | null | undefined>;
  smallPublishers: Resolver<SmallPublisher, {}, readonly SmallPublisher[]>;
  tags: Resolver<SmallPublisher, {}, readonly Tag[]>;
  tasks: Resolver<SmallPublisher, {}, readonly Task[]>;
  type: Resolver<SmallPublisher, {}, PublisherType>;
  updatedAt: Resolver<SmallPublisher, {}, Date>;
}

export interface SmallPublisherGroupResolvers {
  numberOfBookReviewsFormatted: Resolver<SmallPublisherGroup, {}, string>;
}

export interface TagResolvers {
  authors: Resolver<Tag, {}, readonly Author[]>;
  bookReviews: Resolver<Tag, {}, readonly BookReview[]>;
  books: Resolver<Tag, {}, readonly Book[]>;
  createdAt: Resolver<Tag, {}, Date>;
  id: Resolver<Tag, {}, string>;
  name: Resolver<Tag, {}, string>;
  publishers: Resolver<Tag, {}, readonly Publisher[]>;
  tasks: Resolver<Tag, {}, readonly Task[]>;
  updatedAt: Resolver<Tag, {}, Date>;
}

export interface TaskResolvers {
  asyncDefault_1: Resolver<Task, {}, string | null | undefined>;
  asyncDefault_2: Resolver<Task, {}, string | null | undefined>;
  asyncDerived: Resolver<Task, {}, string | null | undefined>;
  comments: Resolver<Task, {}, readonly Comment[]>;
  createdAt: Resolver<Task, {}, Date>;
  deletedAt: Resolver<Task, {}, Date | null | undefined>;
  durationInDays: Resolver<Task, {}, number>;
  id: Resolver<Task, {}, string>;
  newTaskTaskItems: Resolver<Task, {}, readonly TaskItem[]>;
  oldTaskTaskItems: Resolver<Task, {}, readonly TaskItem[]>;
  parentOldTask: Resolver<Task, {}, Task | null | undefined>;
  publishers: Resolver<Task, {}, readonly Publisher[]>;
  specialNewAuthor: Resolver<Task, {}, Author | null | undefined>;
  specialNewField: Resolver<Task, {}, number | null | undefined>;
  specialOldField: Resolver<Task, {}, number | null | undefined>;
  syncDefault: Resolver<Task, {}, string | null | undefined>;
  syncDerived: Resolver<Task, {}, string | null | undefined>;
  tags: Resolver<Task, {}, readonly Tag[]>;
  taskTaskItems: Resolver<Task, {}, readonly TaskItem[]>;
  tasks: Resolver<Task, {}, readonly Task[]>;
  type: Resolver<Task, {}, string>;
  updatedAt: Resolver<Task, {}, Date>;
}

export interface TaskItemResolvers {
  createdAt: Resolver<TaskItem, {}, Date>;
  id: Resolver<TaskItem, {}, string>;
  newTask: Resolver<TaskItem, {}, Task | null | undefined>;
  oldTask: Resolver<TaskItem, {}, Task | null | undefined>;
  task: Resolver<TaskItem, {}, Task | null | undefined>;
  updatedAt: Resolver<TaskItem, {}, Date>;
}

export interface TaskNewResolvers {
  asyncDefault_1: Resolver<TaskNew, {}, string | null | undefined>;
  asyncDefault_2: Resolver<TaskNew, {}, string | null | undefined>;
  asyncDerived: Resolver<TaskNew, {}, string | null | undefined>;
  comments: Resolver<TaskNew, {}, readonly Comment[]>;
  createdAt: Resolver<TaskNew, {}, Date>;
  deletedAt: Resolver<TaskNew, {}, Date | null | undefined>;
  durationInDays: Resolver<TaskNew, {}, number>;
  id: Resolver<TaskNew, {}, string>;
  newTaskTaskItems: Resolver<TaskNew, {}, readonly TaskItem[]>;
  oldTaskTaskItems: Resolver<TaskNew, {}, readonly TaskItem[]>;
  parentOldTask: Resolver<TaskNew, {}, Task | null | undefined>;
  publishers: Resolver<TaskNew, {}, readonly Publisher[]>;
  selfReferential: Resolver<TaskNew, {}, TaskNew | null | undefined>;
  selfReferentialTasks: Resolver<TaskNew, {}, readonly TaskNew[]>;
  specialNewAuthor: Resolver<TaskNew, {}, Author | null | undefined>;
  specialNewField: Resolver<TaskNew, {}, number | null | undefined>;
  syncDefault: Resolver<TaskNew, {}, string | null | undefined>;
  syncDerived: Resolver<TaskNew, {}, string | null | undefined>;
  tags: Resolver<TaskNew, {}, readonly Tag[]>;
  taskTaskItems: Resolver<TaskNew, {}, readonly TaskItem[]>;
  tasks: Resolver<TaskNew, {}, readonly Task[]>;
  type: Resolver<TaskNew, {}, string>;
  updatedAt: Resolver<TaskNew, {}, Date>;
}

export interface TaskOldResolvers {
  asyncDefault_1: Resolver<TaskOld, {}, string | null | undefined>;
  asyncDefault_2: Resolver<TaskOld, {}, string | null | undefined>;
  asyncDerived: Resolver<TaskOld, {}, string | null | undefined>;
  comments: Resolver<TaskOld, {}, readonly Comment[]>;
  createdAt: Resolver<TaskOld, {}, Date>;
  deletedAt: Resolver<TaskOld, {}, Date | null | undefined>;
  durationInDays: Resolver<TaskOld, {}, number>;
  id: Resolver<TaskOld, {}, string>;
  newTaskTaskItems: Resolver<TaskOld, {}, readonly TaskItem[]>;
  oldTaskTaskItems: Resolver<TaskOld, {}, readonly TaskItem[]>;
  parentOldTask: Resolver<TaskOld, {}, Task | null | undefined>;
  publishers: Resolver<TaskOld, {}, readonly Publisher[]>;
  specialNewAuthor: Resolver<TaskOld, {}, Author | null | undefined>;
  specialOldField: Resolver<TaskOld, {}, number | null | undefined>;
  syncDefault: Resolver<TaskOld, {}, string | null | undefined>;
  syncDerived: Resolver<TaskOld, {}, string | null | undefined>;
  tags: Resolver<TaskOld, {}, readonly Tag[]>;
  taskTaskItems: Resolver<TaskOld, {}, readonly TaskItem[]>;
  tasks: Resolver<TaskOld, {}, readonly Task[]>;
  type: Resolver<TaskOld, {}, string>;
  updatedAt: Resolver<TaskOld, {}, Date>;
}

export interface TaskTypeDetailResolvers {
  code: Resolver<TaskType, {}, TaskType>;
  name: Resolver<TaskType, {}, string>;
}

export interface UserResolvers {
  authorManyToOne: Resolver<User, {}, Author | null | undefined>;
  bio: Resolver<User, {}, string>;
  children: Resolver<User, {}, readonly User[]>;
  createdAt: Resolver<User, {}, Date>;
  createdComments: Resolver<User, {}, readonly Comment[]>;
  email: Resolver<User, {}, string>;
  favoritePublisher: Resolver<User, {}, UserFavoritePublisher | null | undefined>;
  id: Resolver<User, {}, string>;
  likedComments: Resolver<User, {}, readonly Comment[]>;
  name: Resolver<User, {}, string>;
  originalEmail: Resolver<User, {}, string>;
  parents: Resolver<User, {}, readonly User[]>;
  updatedAt: Resolver<User, {}, Date>;
}

export interface AdminUsersPageResolvers {
  entities: Resolver<AdminUsersPage, {}, readonly AdminUser[]>;
  pageInfo: Resolver<AdminUsersPage, {}, LimitPageInfo>;
}

export interface AllEnumDetailsResolvers {
  advanceStatus: Resolver<AllEnumDetails, {}, readonly AdvanceStatus[]>;
  bookRange: Resolver<AllEnumDetails, {}, readonly BookRange[]>;
  color: Resolver<AllEnumDetails, {}, readonly Color[]>;
  imageType: Resolver<AllEnumDetails, {}, readonly ImageType[]>;
  publisherSize: Resolver<AllEnumDetails, {}, readonly PublisherSize[]>;
  publisherType: Resolver<AllEnumDetails, {}, readonly PublisherType[]>;
  taskType: Resolver<AllEnumDetails, {}, readonly TaskType[]>;
}

export interface AuthorSchedulesPageResolvers {
  entities: Resolver<AuthorSchedulesPage, {}, readonly AuthorSchedule[]>;
  pageInfo: Resolver<AuthorSchedulesPage, {}, LimitPageInfo>;
}

export interface AuthorStatsPageResolvers {
  entities: Resolver<AuthorStatsPage, {}, readonly AuthorStat[]>;
  pageInfo: Resolver<AuthorStatsPage, {}, LimitPageInfo>;
}

export interface AuthorsPageResolvers {
  entities: Resolver<AuthorsPage, {}, readonly Author[]>;
  pageInfo: Resolver<AuthorsPage, {}, LimitPageInfo>;
}

export interface BookAdvancesPageResolvers {
  entities: Resolver<BookAdvancesPage, {}, readonly BookAdvance[]>;
  pageInfo: Resolver<BookAdvancesPage, {}, LimitPageInfo>;
}

export interface BookReviewsPageResolvers {
  entities: Resolver<BookReviewsPage, {}, readonly BookReview[]>;
  pageInfo: Resolver<BookReviewsPage, {}, LimitPageInfo>;
}

export interface BooksPageResolvers {
  entities: Resolver<BooksPage, {}, readonly Book[]>;
  pageInfo: Resolver<BooksPage, {}, LimitPageInfo>;
}

export interface ChildGroupsPageResolvers {
  entities: Resolver<ChildGroupsPage, {}, readonly ChildGroup[]>;
  pageInfo: Resolver<ChildGroupsPage, {}, LimitPageInfo>;
}

export interface ChildItemsPageResolvers {
  entities: Resolver<ChildItemsPage, {}, readonly ChildItem[]>;
  pageInfo: Resolver<ChildItemsPage, {}, LimitPageInfo>;
}

export interface ChildrenPageResolvers {
  entities: Resolver<ChildrenPage, {}, readonly Child[]>;
  pageInfo: Resolver<ChildrenPage, {}, LimitPageInfo>;
}

export interface CommentsPageResolvers {
  entities: Resolver<CommentsPage, {}, readonly Comment[]>;
  pageInfo: Resolver<CommentsPage, {}, LimitPageInfo>;
}

export interface CriticColumnsPageResolvers {
  entities: Resolver<CriticColumnsPage, {}, readonly CriticColumn[]>;
  pageInfo: Resolver<CriticColumnsPage, {}, LimitPageInfo>;
}

export interface CriticsPageResolvers {
  entities: Resolver<CriticsPage, {}, readonly Critic[]>;
  pageInfo: Resolver<CriticsPage, {}, LimitPageInfo>;
}

export interface ImagesPageResolvers {
  entities: Resolver<ImagesPage, {}, readonly Image[]>;
  pageInfo: Resolver<ImagesPage, {}, LimitPageInfo>;
}

export interface LargePublishersPageResolvers {
  entities: Resolver<LargePublishersPage, {}, readonly LargePublisher[]>;
  pageInfo: Resolver<LargePublishersPage, {}, LimitPageInfo>;
}

export interface NewTaskResolvers {
  id: Resolver<NewTask, {}, string>;
  specialNewField: Resolver<NewTask, {}, number | null | undefined>;
}

export interface OldTaskResolvers {
  id: Resolver<OldTask, {}, string>;
  specialOldField: Resolver<OldTask, {}, number | null | undefined>;
}

export interface ParentGroupsPageResolvers {
  entities: Resolver<ParentGroupsPage, {}, readonly ParentGroup[]>;
  pageInfo: Resolver<ParentGroupsPage, {}, LimitPageInfo>;
}

export interface ParentItemsPageResolvers {
  entities: Resolver<ParentItemsPage, {}, readonly ParentItem[]>;
  pageInfo: Resolver<ParentItemsPage, {}, LimitPageInfo>;
}

export interface PublisherGroupsPageResolvers {
  entities: Resolver<PublisherGroupsPage, {}, readonly PublisherGroup[]>;
  pageInfo: Resolver<PublisherGroupsPage, {}, LimitPageInfo>;
}

export interface PublishersPageResolvers {
  entities: Resolver<PublishersPage, {}, readonly Publisher[]>;
  pageInfo: Resolver<PublishersPage, {}, LimitPageInfo>;
}

export interface SaveAuthorResultResolvers {
  author: Resolver<SaveAuthorResult, {}, Author>;
}

export interface SaveAuthorStatResultResolvers {
  authorStat: Resolver<SaveAuthorStatResult, {}, AuthorStat>;
}

export interface SaveBookAdvanceResultResolvers {
  bookAdvance: Resolver<SaveBookAdvanceResult, {}, BookAdvance>;
}

export interface SaveBookResultResolvers {
  book: Resolver<SaveBookResult, {}, Book>;
}

export interface SaveBookReviewResultResolvers {
  bookReview: Resolver<SaveBookReviewResult, {}, BookReview>;
}

export interface SaveCommentResultResolvers {
  comment: Resolver<SaveCommentResult, {}, Comment>;
}

export interface SaveCriticResultResolvers {
  critic: Resolver<SaveCriticResult, {}, Critic>;
}

export interface SaveImageResultResolvers {
  image: Resolver<SaveImageResult, {}, Image>;
}

export interface SaveLargePublisherResultResolvers {
  largePublisher: Resolver<SaveLargePublisherResult, {}, LargePublisher>;
}

export interface SaveNewTaskResultResolvers {
  newTask: Resolver<SaveNewTaskResult, {}, NewTask>;
}

export interface SaveOldTaskResultResolvers {
  oldTask: Resolver<SaveOldTaskResult, {}, OldTask>;
}

export interface SavePublisherGroupResultResolvers {
  publisherGroup: Resolver<SavePublisherGroupResult, {}, PublisherGroup>;
}

export interface SavePublisherResultResolvers {
  publisher: Resolver<SavePublisherResult, {}, Publisher>;
}

export interface SaveSmallPublisherResultResolvers {
  smallPublisher: Resolver<SaveSmallPublisherResult, {}, SmallPublisher>;
}

export interface SaveTagResultResolvers {
  tag: Resolver<SaveTagResult, {}, Tag>;
}

export interface SaveTaskItemResultResolvers {
  taskItem: Resolver<SaveTaskItemResult, {}, TaskItem>;
}

export interface SaveTaskNewResultResolvers {
  taskNew: Resolver<SaveTaskNewResult, {}, TaskNew>;
}

export interface SaveTaskOldResultResolvers {
  taskOld: Resolver<SaveTaskOldResult, {}, TaskOld>;
}

export interface SaveTaskResultResolvers {
  task: Resolver<SaveTaskResult, {}, Task>;
}

export interface SaveUserResultResolvers {
  user: Resolver<SaveUserResult, {}, User>;
}

export interface SmallPublisherGroupsPageResolvers {
  entities: Resolver<SmallPublisherGroupsPage, {}, readonly SmallPublisherGroup[]>;
  pageInfo: Resolver<SmallPublisherGroupsPage, {}, LimitPageInfo>;
}

export interface SmallPublishersPageResolvers {
  entities: Resolver<SmallPublishersPage, {}, readonly SmallPublisher[]>;
  pageInfo: Resolver<SmallPublishersPage, {}, LimitPageInfo>;
}

export interface TagsPageResolvers {
  entities: Resolver<TagsPage, {}, readonly Tag[]>;
  pageInfo: Resolver<TagsPage, {}, LimitPageInfo>;
}

export interface TaskItemsPageResolvers {
  entities: Resolver<TaskItemsPage, {}, readonly TaskItem[]>;
  pageInfo: Resolver<TaskItemsPage, {}, LimitPageInfo>;
}

export interface TaskNewsPageResolvers {
  entities: Resolver<TaskNewsPage, {}, readonly TaskNew[]>;
  pageInfo: Resolver<TaskNewsPage, {}, LimitPageInfo>;
}

export interface TaskOldsPageResolvers {
  entities: Resolver<TaskOldsPage, {}, readonly TaskOld[]>;
  pageInfo: Resolver<TaskOldsPage, {}, LimitPageInfo>;
}

export interface TasksPageResolvers {
  entities: Resolver<TasksPage, {}, readonly Task[]>;
  pageInfo: Resolver<TasksPage, {}, LimitPageInfo>;
}

export interface UsersPageResolvers {
  entities: Resolver<UsersPage, {}, readonly User[]>;
  pageInfo: Resolver<UsersPage, {}, LimitPageInfo>;
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

export interface AuthorGraphqlOnlyFieldArgs {
  arg?: number | null | undefined;
}
export interface MutationSaveAuthorArgs {
  input: SaveAuthorInput;
}
export interface MutationSaveAuthorStatArgs {
  input: SaveAuthorStatInput;
}
export interface MutationSaveBookArgs {
  input: SaveBookInput;
}
export interface MutationSaveBookAdvanceArgs {
  input: SaveBookAdvanceInput;
}
export interface MutationSaveBookReviewArgs {
  input: SaveBookReviewInput;
}
export interface MutationSaveCommentArgs {
  input: SaveCommentInput;
}
export interface MutationSaveCriticArgs {
  input: SaveCriticInput;
}
export interface MutationSaveImageArgs {
  input: SaveImageInput;
}
export interface MutationSaveLargePublisherArgs {
  input: SaveLargePublisherInput;
}
export interface MutationSaveNewTaskArgs {
  input: SaveNewTaskInput;
}
export interface MutationSaveOldTaskArgs {
  input: SaveOldTaskInput;
}
export interface MutationSavePublisherArgs {
  input: SavePublisherInput;
}
export interface MutationSavePublisherGroupArgs {
  input: SavePublisherGroupInput;
}
export interface MutationSaveSmallPublisherArgs {
  input: SaveSmallPublisherInput;
}
export interface MutationSaveTagArgs {
  input: SaveTagInput;
}
export interface MutationSaveTaskArgs {
  input: SaveTaskInput;
}
export interface MutationSaveTaskItemArgs {
  input: SaveTaskItemInput;
}
export interface MutationSaveTaskNewArgs {
  input: SaveTaskNewInput;
}
export interface MutationSaveTaskOldArgs {
  input: SaveTaskOldInput;
}
export interface MutationSaveUserArgs {
  input: SaveUserInput;
}
export interface QueryAdminUserArgs {
  id: string;
}
export interface QueryAdminUsersArgs {
  filter?: AdminUserFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryAuthorArgs {
  id: string;
}
export interface QueryAuthorScheduleArgs {
  id: string;
}
export interface QueryAuthorSchedulesArgs {
  filter?: AuthorScheduleFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryAuthorStatArgs {
  id: string;
}
export interface QueryAuthorStatsArgs {
  filter?: AuthorStatFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryAuthorsArgs {
  filter?: AuthorFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryBookArgs {
  id: string;
}
export interface QueryBookAdvanceArgs {
  id: string;
}
export interface QueryBookAdvancesArgs {
  filter?: BookAdvanceFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryBookReviewArgs {
  id: string;
}
export interface QueryBookReviewsArgs {
  filter?: BookReviewFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryBooksArgs {
  filter?: BookFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryChildArgs {
  id: string;
}
export interface QueryChildGroupArgs {
  id: string;
}
export interface QueryChildGroupsArgs {
  filter?: ChildGroupFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryChildItemArgs {
  id: string;
}
export interface QueryChildItemsArgs {
  filter?: ChildItemFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryChildrenArgs {
  filter?: ChildFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryCommentArgs {
  id: string;
}
export interface QueryCommentsArgs {
  filter?: CommentFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryCriticArgs {
  id: string;
}
export interface QueryCriticColumnArgs {
  id: string;
}
export interface QueryCriticColumnsArgs {
  filter?: CriticColumnFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryCriticsArgs {
  filter?: CriticFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryImageArgs {
  id: string;
}
export interface QueryImagesArgs {
  filter?: ImageFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryLargePublisherArgs {
  id: string;
}
export interface QueryLargePublishersArgs {
  filter?: LargePublisherFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryParentGroupArgs {
  id: string;
}
export interface QueryParentGroupsArgs {
  filter?: ParentGroupFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryParentItemArgs {
  id: string;
}
export interface QueryParentItemsArgs {
  filter?: ParentItemFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryPublisherArgs {
  id: string;
}
export interface QueryPublisherGroupArgs {
  id: string;
}
export interface QueryPublisherGroupsArgs {
  filter?: PublisherGroupFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryPublishersArgs {
  filter?: PublisherFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QuerySmallPublisherArgs {
  id: string;
}
export interface QuerySmallPublisherGroupArgs {
  id: string;
}
export interface QuerySmallPublisherGroupsArgs {
  filter?: SmallPublisherGroupFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QuerySmallPublishersArgs {
  filter?: SmallPublisherFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryTagArgs {
  id: string;
}
export interface QueryTagsArgs {
  filter?: TagFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryTaskArgs {
  id: string;
}
export interface QueryTaskItemArgs {
  id: string;
}
export interface QueryTaskItemsArgs {
  filter?: TaskItemFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryTaskNewArgs {
  id: string;
}
export interface QueryTaskNewsArgs {
  filter?: TaskNewFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryTaskOldArgs {
  id: string;
}
export interface QueryTaskOldsArgs {
  filter?: TaskOldFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryTasksArgs {
  filter?: TaskFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface QueryUserArgs {
  id: string;
}
export interface QueryUsersArgs {
  filter?: UserFilter | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}
export interface AdminUsersPage {
  entities: AdminUser[];
  pageInfo: LimitPageInfo;
}

export interface AllEnumDetails {
  advanceStatus: AdvanceStatus[];
  bookRange: BookRange[];
  color: Color[];
  imageType: ImageType[];
  publisherSize: PublisherSize[];
  publisherType: PublisherType[];
  taskType: TaskType[];
}

export interface AuthorSchedulesPage {
  entities: AuthorSchedule[];
  pageInfo: LimitPageInfo;
}

export interface AuthorStatsPage {
  entities: AuthorStat[];
  pageInfo: LimitPageInfo;
}

export interface AuthorsPage {
  entities: Author[];
  pageInfo: LimitPageInfo;
}

export interface BookAdvancesPage {
  entities: BookAdvance[];
  pageInfo: LimitPageInfo;
}

export interface BookReviewsPage {
  entities: BookReview[];
  pageInfo: LimitPageInfo;
}

export interface BooksPage {
  entities: Book[];
  pageInfo: LimitPageInfo;
}

export interface ChildGroupsPage {
  entities: ChildGroup[];
  pageInfo: LimitPageInfo;
}

export interface ChildItemsPage {
  entities: ChildItem[];
  pageInfo: LimitPageInfo;
}

export interface ChildrenPage {
  entities: Child[];
  pageInfo: LimitPageInfo;
}

export interface CommentsPage {
  entities: Comment[];
  pageInfo: LimitPageInfo;
}

export interface CriticColumnsPage {
  entities: CriticColumn[];
  pageInfo: LimitPageInfo;
}

export interface CriticsPage {
  entities: Critic[];
  pageInfo: LimitPageInfo;
}

export interface ImagesPage {
  entities: Image[];
  pageInfo: LimitPageInfo;
}

export interface LargePublishersPage {
  entities: LargePublisher[];
  pageInfo: LimitPageInfo;
}

export interface NewTask {
  id: string;
  specialNewField: number | null | undefined;
}

export interface OldTask {
  id: string;
  specialOldField: number | null | undefined;
}

export interface ParentGroupsPage {
  entities: ParentGroup[];
  pageInfo: LimitPageInfo;
}

export interface ParentItemsPage {
  entities: ParentItem[];
  pageInfo: LimitPageInfo;
}

export interface PublisherGroupsPage {
  entities: PublisherGroup[];
  pageInfo: LimitPageInfo;
}

export interface PublishersPage {
  entities: Publisher[];
  pageInfo: LimitPageInfo;
}

export interface SaveAuthorResult {
  author: Author;
}

export interface SaveAuthorStatResult {
  authorStat: AuthorStat;
}

export interface SaveBookAdvanceResult {
  bookAdvance: BookAdvance;
}

export interface SaveBookResult {
  book: Book;
}

export interface SaveBookReviewResult {
  bookReview: BookReview;
}

export interface SaveCommentResult {
  comment: Comment;
}

export interface SaveCriticResult {
  critic: Critic;
}

export interface SaveImageResult {
  image: Image;
}

export interface SaveLargePublisherResult {
  largePublisher: LargePublisher;
}

export interface SaveNewTaskResult {
  newTask: NewTask;
}

export interface SaveOldTaskResult {
  oldTask: OldTask;
}

export interface SavePublisherGroupResult {
  publisherGroup: PublisherGroup;
}

export interface SavePublisherResult {
  publisher: Publisher;
}

export interface SaveSmallPublisherResult {
  smallPublisher: SmallPublisher;
}

export interface SaveTagResult {
  tag: Tag;
}

export interface SaveTaskItemResult {
  taskItem: TaskItem;
}

export interface SaveTaskNewResult {
  taskNew: TaskNew;
}

export interface SaveTaskOldResult {
  taskOld: TaskOld;
}

export interface SaveTaskResult {
  task: Task;
}

export interface SaveUserResult {
  user: User;
}

export interface SmallPublisherGroupsPage {
  entities: SmallPublisherGroup[];
  pageInfo: LimitPageInfo;
}

export interface SmallPublishersPage {
  entities: SmallPublisher[];
  pageInfo: LimitPageInfo;
}

export interface TagsPage {
  entities: Tag[];
  pageInfo: LimitPageInfo;
}

export interface TaskItemsPage {
  entities: TaskItem[];
  pageInfo: LimitPageInfo;
}

export interface TaskNewsPage {
  entities: TaskNew[];
  pageInfo: LimitPageInfo;
}

export interface TaskOldsPage {
  entities: TaskOld[];
  pageInfo: LimitPageInfo;
}

export interface TasksPage {
  entities: Task[];
  pageInfo: LimitPageInfo;
}

export interface UsersPage {
  entities: User[];
  pageInfo: LimitPageInfo;
}

export interface AdminUserFilter {
  authorManyToOneId?: string[] | null | undefined;
  bio?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  email?: string[] | null | undefined;
  favoritePublisherId?: string[] | null | undefined;
  id?: string[] | null | undefined;
  managerId?: string[] | null | undefined;
  name?: string[] | null | undefined;
  originalEmail?: string[] | null | undefined;
  role?: string[] | null | undefined;
  trialPeriod?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface AuthorFilter {
  age?: number[] | null | undefined;
  bookComments?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  currentDraftBookId?: string[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  favoriteBookId?: string[] | null | undefined;
  favoriteColors?: Color[][] | null | undefined;
  favoriteShape?: FavoriteShape[] | null | undefined;
  firstName?: string[] | null | undefined;
  graduated?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  imageFileName?: string[] | null | undefined;
  initials?: string[] | null | undefined;
  isFunny?: boolean[] | null | undefined;
  isPopular?: boolean[] | null | undefined;
  lastName?: string[] | null | undefined;
  menteeNames?: string[] | null | undefined;
  mentorId?: string[] | null | undefined;
  mentorNames?: string[] | null | undefined;
  numberOfAtoms?: bigint[] | null | undefined;
  numberOfBooks?: number[] | null | undefined;
  numberOfPublicReviews?: number[] | null | undefined;
  numberOfPublicReviews2?: number[] | null | undefined;
  publisherId?: string[] | null | undefined;
  rangeOfBooks?: BookRange[] | null | undefined;
  rootMentorId?: string[] | null | undefined;
  search?: string[] | null | undefined;
  ssn?: string[] | null | undefined;
  tagsOfAllBooks?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
  wasEverPopular?: boolean[] | null | undefined;
}

export interface AuthorScheduleFilter {
  authorId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  overview?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface AuthorStatFilter {
  bigint?: bigint[] | null | undefined;
  bigserial?: bigint[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  decimal?: number[] | null | undefined;
  doublePrecision?: number[] | null | undefined;
  id?: string[] | null | undefined;
  integer?: number[] | null | undefined;
  nullableInteger?: number[] | null | undefined;
  nullableText?: string[] | null | undefined;
  real?: number[] | null | undefined;
  serial?: number[] | null | undefined;
  smallint?: number[] | null | undefined;
  smallserial?: number[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface BookAdvanceFilter {
  bookId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  publisherId?: string[] | null | undefined;
  status?: AdvanceStatus[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface BookFilter {
  acknowledgements?: string[] | null | undefined;
  authorId?: string[] | null | undefined;
  authorsNickNames?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  notes?: string[] | null | undefined;
  order?: number[] | null | undefined;
  prequelId?: string[] | null | undefined;
  randomCommentId?: string[] | null | undefined;
  reviewerId?: string[] | null | undefined;
  search?: string[] | null | undefined;
  title?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface BookReviewFilter {
  bookId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  criticId?: string[] | null | undefined;
  id?: string[] | null | undefined;
  isPublic?: boolean[] | null | undefined;
  isTest?: boolean[] | null | undefined;
  isTestChain?: boolean[] | null | undefined;
  rating?: number[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface ChildFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface ChildGroupFilter {
  childGroupId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  parentGroupId?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface ChildItemFilter {
  childGroupId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  parentItemId?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface CommentFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  parentId?: string[] | null | undefined;
  parentTaggedId?: string[] | null | undefined;
  parentTags?: string[] | null | undefined;
  text?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
  userId?: string[] | null | undefined;
}

export interface CriticColumnFilter {
  createdAt?: Date[] | null | undefined;
  criticId?: string[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface CriticFilter {
  createdAt?: Date[] | null | undefined;
  favoriteLargePublisherId?: string[] | null | undefined;
  groupId?: string[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface ImageFilter {
  authorId?: string[] | null | undefined;
  bookId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  fileName?: string[] | null | undefined;
  id?: string[] | null | undefined;
  publisherId?: string[] | null | undefined;
  type?: ImageType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface LargePublisherFilter {
  baseAsyncDefault?: string[] | null | undefined;
  baseSyncDefault?: string[] | null | undefined;
  bookAdvanceTitlesSnapshot?: string[] | null | undefined;
  country?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  favoriteAuthorId?: string[] | null | undefined;
  favoriteAuthorName?: string[] | null | undefined;
  groupId?: string[] | null | undefined;
  hugeNumber?: number[] | null | undefined;
  id?: string[] | null | undefined;
  latitude?: number[] | null | undefined;
  longitude?: number[] | null | undefined;
  name?: string[] | null | undefined;
  numberOfBookAdvancesSnapshot?: string[] | null | undefined;
  numberOfBookReviews?: number[] | null | undefined;
  sharedColumn?: string[] | null | undefined;
  size?: PublisherSize[] | null | undefined;
  spotlightAuthorId?: string[] | null | undefined;
  titlesOfFavoriteBooks?: string[] | null | undefined;
  type?: PublisherType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface ParentGroupFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface ParentItemFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  parentGroupId?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface PublisherFilter {
  baseAsyncDefault?: string[] | null | undefined;
  baseSyncDefault?: string[] | null | undefined;
  bookAdvanceTitlesSnapshot?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  favoriteAuthorId?: string[] | null | undefined;
  favoriteAuthorName?: string[] | null | undefined;
  groupId?: string[] | null | undefined;
  hugeNumber?: number[] | null | undefined;
  id?: string[] | null | undefined;
  latitude?: number[] | null | undefined;
  longitude?: number[] | null | undefined;
  name?: string[] | null | undefined;
  numberOfBookAdvancesSnapshot?: string[] | null | undefined;
  numberOfBookReviews?: number[] | null | undefined;
  rating?: number[] | null | undefined;
  size?: PublisherSize[] | null | undefined;
  spotlightAuthorId?: string[] | null | undefined;
  titlesOfFavoriteBooks?: string[] | null | undefined;
  type?: PublisherType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface PublisherGroupFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  numberOfBookReviews?: number[] | null | undefined;
  numberOfBookReviewsFormatted?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface SaveAuthorInput {
  age?: number | null | undefined;
  createdAt?: Date | null | undefined;
  currentDraftBookId?: string | null | undefined;
  deletedAt?: Date | null | undefined;
  favoriteBookId?: string | null | undefined;
  favoriteColors?: Color[] | null | undefined;
  favoriteShape?: FavoriteShape | null | undefined;
  firstName?: string | null | undefined;
  graduated?: Date | null | undefined;
  id?: string | null | undefined;
  imageFileName?: string | null | undefined;
  initials?: string | null | undefined;
  isFunny?: boolean | null | undefined;
  isPopular?: boolean | null | undefined;
  lastName?: string | null | undefined;
  menteeNames?: string | null | undefined;
  mentorId?: string | null | undefined;
  mentorNames?: string | null | undefined;
  nickNames?: string[] | null | undefined;
  numberOfAtoms?: bigint | null | undefined;
  numberOfBooks?: number | null | undefined;
  publisherId?: string | null | undefined;
  rangeOfBooks?: BookRange | null | undefined;
  ssn?: string | null | undefined;
  updatedAt?: Date | null | undefined;
  wasEverPopular?: boolean | null | undefined;
}

export interface SaveAuthorStatInput {
  bigint?: bigint | null | undefined;
  bigserial?: bigint | null | undefined;
  decimal?: number | null | undefined;
  doublePrecision?: number | null | undefined;
  id?: string | null | undefined;
  integer?: number | null | undefined;
  nullableInteger?: number | null | undefined;
  nullableText?: string | null | undefined;
  real?: number | null | undefined;
  serial?: number | null | undefined;
  smallint?: number | null | undefined;
  smallserial?: number | null | undefined;
}

export interface SaveBookAdvanceInput {
  bookId?: string | null | undefined;
  createdAt?: Date | null | undefined;
  id?: string | null | undefined;
  publisherId?: string | null | undefined;
  status?: AdvanceStatus | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveBookInput {
  acknowledgements?: string | null | undefined;
  authorId?: string | null | undefined;
  authorsNickNames?: string | null | undefined;
  createdAt?: Date | null | undefined;
  deletedAt?: Date | null | undefined;
  id?: string | null | undefined;
  notes?: string | null | undefined;
  order?: number | null | undefined;
  title?: string | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveBookReviewInput {
  bookId?: string | null | undefined;
  createdAt?: Date | null | undefined;
  id?: string | null | undefined;
  isPublic?: boolean | null | undefined;
  rating?: number | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveCommentInput {
  id?: string | null | undefined;
  parentId?: string | null | undefined;
  parentTags?: string | null | undefined;
  text?: string | null | undefined;
  userId?: string | null | undefined;
}

export interface SaveCriticInput {
  createdAt?: Date | null | undefined;
  favoriteLargePublisherId?: string | null | undefined;
  groupId?: string | null | undefined;
  id?: string | null | undefined;
  name?: string | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveImageInput {
  authorId?: string | null | undefined;
  bookId?: string | null | undefined;
  createdAt?: Date | null | undefined;
  fileName?: string | null | undefined;
  id?: string | null | undefined;
  publisherId?: string | null | undefined;
  type?: ImageType | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveLargePublisherInput {
  baseAsyncDefault?: string | null | undefined;
  baseSyncDefault?: string | null | undefined;
  country?: string | null | undefined;
  deletedAt?: Date | null | undefined;
  groupId?: string | null | undefined;
  hugeNumber?: number | null | undefined;
  id?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  name?: string | null | undefined;
  rating?: number | null | undefined;
  sharedColumn?: string | null | undefined;
  size?: PublisherSize | null | undefined;
  type?: PublisherType | null | undefined;
}

export interface SaveNewTaskInput {
  id?: string | null | undefined;
  specialNewField?: number | null | undefined;
}

export interface SaveOldTaskInput {
  id?: string | null | undefined;
  specialOldField?: number | null | undefined;
}

export interface SavePublisherGroupInput {
  id?: string | null | undefined;
  name?: string | null | undefined;
  numberOfBookReviews?: number | null | undefined;
  numberOfBookReviewsFormatted?: string | null | undefined;
}

export interface SavePublisherInput {
  baseAsyncDefault?: string | null | undefined;
  baseSyncDefault?: string | null | undefined;
  createdAt?: Date | null | undefined;
  deletedAt?: Date | null | undefined;
  groupId?: string | null | undefined;
  hugeNumber?: number | null | undefined;
  id?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  name?: string | null | undefined;
  rating?: number | null | undefined;
  size?: PublisherSize | null | undefined;
  type?: PublisherType | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveSmallPublisherGroupInput {
  numberOfBookReviewsFormatted?: string | null | undefined;
}

export interface SaveSmallPublisherInput {
  baseAsyncDefault?: string | null | undefined;
  baseSyncDefault?: string | null | undefined;
  city?: string | null | undefined;
  deletedAt?: Date | null | undefined;
  groupId?: string | null | undefined;
  hugeNumber?: number | null | undefined;
  id?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  name?: string | null | undefined;
  rating?: number | null | undefined;
  selfReferentialId?: string | null | undefined;
  sharedColumn?: string | null | undefined;
  size?: PublisherSize | null | undefined;
  type?: PublisherType | null | undefined;
}

export interface SaveTagInput {
  createdAt?: Date | null | undefined;
  id?: string | null | undefined;
  name?: string | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface SaveTaskInput {
  asyncDefault_1?: string | null | undefined;
  asyncDefault_2?: string | null | undefined;
  asyncDerived?: string | null | undefined;
  deletedAt?: Date | null | undefined;
  durationInDays?: number | null | undefined;
  id?: string | null | undefined;
  parentOldTaskId?: string | null | undefined;
  specialNewAuthorId?: string | null | undefined;
  specialNewField?: number | null | undefined;
  specialOldField?: number | null | undefined;
  syncDefault?: string | null | undefined;
  type?: string | null | undefined;
}

export interface SaveTaskItemInput {
  id?: string | null | undefined;
  newTaskId?: string | null | undefined;
  oldTaskId?: string | null | undefined;
  taskId?: string | null | undefined;
}

export interface SaveTaskNewInput {
  asyncDefault_1?: string | null | undefined;
  asyncDefault_2?: string | null | undefined;
  deletedAt?: Date | null | undefined;
  durationInDays?: number | null | undefined;
  id?: string | null | undefined;
  parentOldTaskId?: string | null | undefined;
  selfReferentialId?: string | null | undefined;
  specialNewAuthorId?: string | null | undefined;
  specialNewField?: number | null | undefined;
  syncDefault?: string | null | undefined;
  type?: string | null | undefined;
}

export interface SaveTaskOldInput {
  asyncDefault_1?: string | null | undefined;
  asyncDefault_2?: string | null | undefined;
  deletedAt?: Date | null | undefined;
  durationInDays?: number | null | undefined;
  id?: string | null | undefined;
  parentOldTaskId?: string | null | undefined;
  specialNewAuthorId?: string | null | undefined;
  specialOldField?: number | null | undefined;
  syncDefault?: string | null | undefined;
  type?: string | null | undefined;
}

export interface SaveUserInput {
  authorManyToOneId?: string | null | undefined;
  bio?: string | null | undefined;
  email?: string | null | undefined;
  favoritePublisherId?: string | null | undefined;
  id?: string | null | undefined;
  name?: string | null | undefined;
  originalEmail?: string | null | undefined;
}

export interface SmallPublisherFilter {
  allAuthorNames?: string[] | null | undefined;
  baseAsyncDefault?: string[] | null | undefined;
  baseSyncDefault?: string[] | null | undefined;
  bookAdvanceTitlesSnapshot?: string[] | null | undefined;
  city?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  favoriteAuthorId?: string[] | null | undefined;
  favoriteAuthorName?: string[] | null | undefined;
  groupId?: string[] | null | undefined;
  hugeNumber?: number[] | null | undefined;
  id?: string[] | null | undefined;
  latitude?: number[] | null | undefined;
  longitude?: number[] | null | undefined;
  name?: string[] | null | undefined;
  numberOfBookAdvancesSnapshot?: string[] | null | undefined;
  numberOfBookReviews?: number[] | null | undefined;
  rating?: number[] | null | undefined;
  selfReferentialId?: string[] | null | undefined;
  sharedColumn?: string[] | null | undefined;
  size?: PublisherSize[] | null | undefined;
  spotlightAuthorId?: string[] | null | undefined;
  titlesOfFavoriteBooks?: string[] | null | undefined;
  type?: PublisherType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface SmallPublisherGroupFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  numberOfBookReviews?: number[] | null | undefined;
  numberOfBookReviewsFormatted?: string[] | null | undefined;
  smallName?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface TagFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  name?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface TaskFilter {
  asyncDefault_1?: string[] | null | undefined;
  asyncDefault_2?: string[] | null | undefined;
  asyncDerived?: string[] | null | undefined;
  copiedFromId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  durationInDays?: number[] | null | undefined;
  id?: string[] | null | undefined;
  syncDefault?: string[] | null | undefined;
  syncDerived?: string[] | null | undefined;
  type?: TaskType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface TaskItemFilter {
  createdAt?: Date[] | null | undefined;
  id?: string[] | null | undefined;
  newTaskId?: string[] | null | undefined;
  oldTaskId?: string[] | null | undefined;
  taskId?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface TaskNewFilter {
  asyncDefault_1?: string[] | null | undefined;
  asyncDefault_2?: string[] | null | undefined;
  asyncDerived?: string[] | null | undefined;
  copiedFromId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  durationInDays?: number[] | null | undefined;
  id?: string[] | null | undefined;
  selfReferentialId?: string[] | null | undefined;
  specialNewAuthorId?: string[] | null | undefined;
  specialNewField?: number[] | null | undefined;
  syncDefault?: string[] | null | undefined;
  syncDerived?: string[] | null | undefined;
  type?: TaskType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface TaskOldFilter {
  asyncDefault_1?: string[] | null | undefined;
  asyncDefault_2?: string[] | null | undefined;
  asyncDerived?: string[] | null | undefined;
  copiedFromId?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  deletedAt?: Date[] | null | undefined;
  durationInDays?: number[] | null | undefined;
  id?: string[] | null | undefined;
  parentOldTaskId?: string[] | null | undefined;
  specialOldField?: number[] | null | undefined;
  syncDefault?: string[] | null | undefined;
  syncDerived?: string[] | null | undefined;
  type?: TaskType[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export interface UserFilter {
  authorManyToOneId?: string[] | null | undefined;
  bio?: string[] | null | undefined;
  createdAt?: Date[] | null | undefined;
  email?: string[] | null | undefined;
  favoritePublisherId?: string[] | null | undefined;
  id?: string[] | null | undefined;
  managerId?: string[] | null | undefined;
  name?: string[] | null | undefined;
  originalEmail?: string[] | null | undefined;
  trialPeriod?: string[] | null | undefined;
  updatedAt?: Date[] | null | undefined;
}

export { AdvanceStatus } from "src/entities";

export { BookRange } from "src/entities";

export { Color } from "src/entities";

export { FavoriteShape } from "src/entities";

export { ImageType } from "src/entities";

export { PublisherSize } from "src/entities";

export { PublisherType } from "src/entities";

export { TaskType } from "src/entities";

export type CommentParent = Author | Book | BookReview | Publisher | TaskOld;

export type UserFavoritePublisher = LargePublisher | SmallPublisher;

export const possibleTypes = {
  CommentParent: ["Author", "Book", "BookReview", "Publisher", "TaskOld"],
  UserFavoritePublisher: ["LargePublisher", "SmallPublisher"],
};
