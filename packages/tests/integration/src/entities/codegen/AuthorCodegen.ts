import {
  BaseEntity,
  type BooleanFilter,
  type BooleanGraphQLFilter,
  type Changes,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  hasReactiveManyToManyOtherSide,
  hasRecursiveChildren,
  hasRecursiveParents,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  type OneToOneReference,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type ReactiveField,
  type ReactiveManyToMany,
  type ReactiveManyToManyOtherSide,
  type ReactiveReference,
  type ReadOnlyCollection,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { Address, address, AddressSchema, Quotes, quotes } from "src/entities/types";
import { assert } from "superstruct";
import { z } from "zod";
import {
  type Author,
  authorMeta,
  type AuthorSchedule,
  type AuthorScheduleId,
  type Book,
  type BookId,
  type BookOrder,
  BookRange,
  type BookReview,
  type BookReviewId,
  Color,
  ColorDetails,
  Colors,
  type Comment,
  type CommentId,
  type Entity,
  EntityManager,
  FavoriteShape,
  type Image,
  type ImageId,
  type LargePublisher,
  type LargePublisherId,
  newAuthor,
  type Publisher,
  type PublisherId,
  type PublisherOrder,
  type SmallPublisher,
  type SmallPublisherId,
  type Tag,
  type TagId,
  type TaskNew,
  type TaskNewId,
  type User,
  type UserId,
} from "../entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  lastName: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  ssn: { kind: "primitive"; type: string; unique: true; nullable: undefined; derived: false };
  initials: { kind: "primitive"; type: string; unique: false; nullable: never; derived: true };
  numberOfBooks: { kind: "primitive"; type: number; unique: false; nullable: never; derived: true };
  bookComments: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  isPopular: { kind: "primitive"; type: boolean; unique: false; nullable: undefined; derived: false };
  age: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  graduated: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  nickNames: { kind: "primitive"; type: string[]; unique: false; nullable: undefined; derived: false };
  nickNamesUpper: { kind: "primitive"; type: string[]; unique: false; nullable: undefined; derived: true };
  wasEverPopular: { kind: "primitive"; type: boolean; unique: false; nullable: undefined; derived: false };
  isFunny: { kind: "primitive"; type: boolean; unique: false; nullable: never; derived: false };
  mentorNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  menteeNames: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  address: { kind: "primitive"; type: Address; unique: false; nullable: undefined; derived: false };
  businessAddress: {
    kind: "primitive";
    type: z.input<typeof AddressSchema>;
    unique: false;
    nullable: undefined;
    derived: false;
  };
  quotes: { kind: "primitive"; type: Quotes; unique: false; nullable: undefined; derived: false };
  numberOfAtoms: { kind: "primitive"; type: bigint; unique: false; nullable: undefined; derived: false };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  numberOfPublicReviews: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: true };
  numberOfPublicReviews2: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: true };
  tagsOfAllBooks: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  search: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  certificate: { kind: "primitive"; type: Uint8Array; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  rangeOfBooks: { kind: "enum"; type: BookRange; nullable: undefined };
  favoriteColors: { kind: "enum"; type: Color[]; nullable: never };
  favoriteShape: { kind: "enum"; type: FavoriteShape; nullable: undefined; native: true };
  mentor: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  rootMentor: { kind: "m2o"; type: Author; nullable: undefined; derived: true };
  currentDraftBook: { kind: "m2o"; type: Book; nullable: undefined; derived: false };
  favoriteBook: { kind: "m2o"; type: Book; nullable: undefined; derived: true };
  publisher: { kind: "m2o"; type: Publisher; nullable: undefined; derived: false };
  mentorsClosure: { kind: "m2m"; type: Author };
  menteesClosure: { kind: "m2m"; type: Author };
  tags: { kind: "m2m"; type: Tag };
  bestReviews: { kind: "m2m"; type: BookReview };
  mentees: { kind: "o2m"; type: Author };
  books: { kind: "o2m"; type: Book };
  reviewerBooks: { kind: "o2m"; type: Book };
  schedules: { kind: "o2m"; type: AuthorSchedule };
  comments: { kind: "o2m"; type: Comment };
  spotlightAuthorPublishers: { kind: "o2m"; type: Publisher };
  tasks: { kind: "o2m"; type: TaskNew };
}

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  ssn?: string | null;
  isPopular?: boolean | null;
  age?: number | null;
  graduated?: Date | null;
  nickNames?: string[] | null;
  wasEverPopular?: boolean | null;
  isFunny?: boolean;
  address?: Address | null;
  businessAddress?: z.input<typeof AddressSchema> | null;
  quotes?: Quotes | null;
  numberOfAtoms?: bigint | null;
  deletedAt?: Date | null;
  certificate?: Uint8Array | null;
  favoriteColors?: Color[];
  favoriteShape?: FavoriteShape | null;
  mentor?: Author | AuthorId | null;
  currentDraftBook?: Book | BookId | null;
  publisher?: Publisher | PublisherId | null;
  image?: Image | null;
  userOneToOne?: User | null;
  mentees?: Author[];
  books?: Book[];
  reviewerBooks?: Book[];
  schedules?: AuthorSchedule[];
  comments?: Comment[];
  spotlightAuthorPublishers?: Publisher[];
  tasks?: TaskNew[];
  tags?: Tag[];
}

export interface AuthorIdsOpts {
  mentorId?: AuthorId | null;
  currentDraftBookId?: BookId | null;
  publisherId?: PublisherId | null;
  imageId?: ImageId | null;
  userOneToOneId?: UserId | null;
  menteeIds?: AuthorId[] | null;
  bookIds?: BookId[] | null;
  reviewerBookIds?: BookId[] | null;
  scheduleIds?: AuthorScheduleId[] | null;
  commentIds?: CommentId[] | null;
  spotlightAuthorPublisherIds?: PublisherId[] | null;
  taskIds?: TaskNewId[] | null;
  tagIds?: TagId[] | null;
}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never> | null;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null>;
  ssn?: ValueFilter<string, null>;
  initials?: ValueFilter<string, never>;
  numberOfBooks?: ValueFilter<number, never>;
  bookComments?: ValueFilter<string, null>;
  isPopular?: BooleanFilter<null>;
  age?: ValueFilter<number, null>;
  graduated?: ValueFilter<Date, null>;
  nickNames?: ValueFilter<string[], null>;
  nickNamesUpper?: ValueFilter<string[], null>;
  wasEverPopular?: BooleanFilter<null>;
  isFunny?: BooleanFilter<never>;
  mentorNames?: ValueFilter<string, null>;
  menteeNames?: ValueFilter<string, null>;
  address?: ValueFilter<Address, null>;
  businessAddress?: ValueFilter<z.input<typeof AddressSchema>, null>;
  quotes?: ValueFilter<Quotes, null>;
  numberOfAtoms?: ValueFilter<bigint, null>;
  deletedAt?: ValueFilter<Date, null>;
  numberOfPublicReviews?: ValueFilter<number, null>;
  numberOfPublicReviews2?: ValueFilter<number, null>;
  tagsOfAllBooks?: ValueFilter<string, null>;
  search?: ValueFilter<string, null>;
  certificate?: ValueFilter<Uint8Array, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  rangeOfBooks?: ValueFilter<BookRange, null>;
  favoriteColors?: ValueFilter<Color[], null>;
  favoriteShape?: ValueFilter<FavoriteShape, null>;
  mentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  rootMentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  currentDraftBook?: EntityFilter<Book, BookId, FilterOf<Book>, null>;
  favoriteBook?: EntityFilter<Book, BookId, FilterOf<Book>, null>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null>;
  publisherLargePublisher?: EntityFilter<LargePublisher, LargePublisherId, FilterOf<LargePublisher>, null>;
  publisherSmallPublisher?: EntityFilter<SmallPublisher, SmallPublisherId, FilterOf<SmallPublisher>, null>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
  userOneToOne?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  mentees?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  reviewerBooks?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  schedules?: EntityFilter<AuthorSchedule, AuthorScheduleId, FilterOf<AuthorSchedule>, null | undefined>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  spotlightAuthorPublishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
  spotlightAuthorPublishersLargePublisher?: EntityFilter<
    LargePublisher,
    LargePublisherId,
    FilterOf<LargePublisher>,
    null
  >;
  spotlightAuthorPublishersSmallPublisher?: EntityFilter<
    SmallPublisher,
    SmallPublisherId,
    FilterOf<SmallPublisher>,
    null
  >;
  tasks?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null | undefined>;
  mentorsClosure?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  menteesClosure?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
  bestReviews?: EntityFilter<BookReview, BookReviewId, FilterOf<BookReview>, null | undefined>;
}

export interface AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  ssn?: ValueGraphQLFilter<string>;
  initials?: ValueGraphQLFilter<string>;
  numberOfBooks?: ValueGraphQLFilter<number>;
  bookComments?: ValueGraphQLFilter<string>;
  isPopular?: BooleanGraphQLFilter;
  age?: ValueGraphQLFilter<number>;
  graduated?: ValueGraphQLFilter<Date>;
  nickNames?: ValueGraphQLFilter<string[]>;
  nickNamesUpper?: ValueGraphQLFilter<string[]>;
  wasEverPopular?: BooleanGraphQLFilter;
  isFunny?: BooleanGraphQLFilter;
  mentorNames?: ValueGraphQLFilter<string>;
  menteeNames?: ValueGraphQLFilter<string>;
  address?: ValueGraphQLFilter<Address>;
  businessAddress?: ValueGraphQLFilter<z.input<typeof AddressSchema>>;
  quotes?: ValueGraphQLFilter<Quotes>;
  numberOfAtoms?: ValueGraphQLFilter<bigint>;
  deletedAt?: ValueGraphQLFilter<Date>;
  numberOfPublicReviews?: ValueGraphQLFilter<number>;
  numberOfPublicReviews2?: ValueGraphQLFilter<number>;
  tagsOfAllBooks?: ValueGraphQLFilter<string>;
  search?: ValueGraphQLFilter<string>;
  certificate?: ValueGraphQLFilter<Uint8Array>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  rangeOfBooks?: ValueGraphQLFilter<BookRange>;
  favoriteColors?: ValueGraphQLFilter<Color[]>;
  favoriteShape?: ValueGraphQLFilter<FavoriteShape>;
  mentor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  rootMentor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  currentDraftBook?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null>;
  favoriteBook?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null>;
  publisherLargePublisher?: EntityGraphQLFilter<
    LargePublisher,
    LargePublisherId,
    GraphQLFilterOf<LargePublisher>,
    null
  >;
  publisherSmallPublisher?: EntityGraphQLFilter<
    SmallPublisher,
    SmallPublisherId,
    GraphQLFilterOf<SmallPublisher>,
    null
  >;
  image?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>, null | undefined>;
  userOneToOne?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  mentees?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  books?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  reviewerBooks?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  schedules?: EntityGraphQLFilter<AuthorSchedule, AuthorScheduleId, GraphQLFilterOf<AuthorSchedule>, null | undefined>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  spotlightAuthorPublishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
  spotlightAuthorPublishersLargePublisher?: EntityGraphQLFilter<
    LargePublisher,
    LargePublisherId,
    GraphQLFilterOf<LargePublisher>,
    null
  >;
  spotlightAuthorPublishersSmallPublisher?: EntityGraphQLFilter<
    SmallPublisher,
    SmallPublisherId,
    GraphQLFilterOf<SmallPublisher>,
    null
  >;
  tasks?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null | undefined>;
  mentorsClosure?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  menteesClosure?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
  bestReviews?: EntityGraphQLFilter<BookReview, BookReviewId, GraphQLFilterOf<BookReview>, null | undefined>;
}

export interface AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  ssn?: OrderBy;
  initials?: OrderBy;
  numberOfBooks?: OrderBy;
  bookComments?: OrderBy;
  isPopular?: OrderBy;
  age?: OrderBy;
  graduated?: OrderBy;
  nickNames?: OrderBy;
  nickNamesUpper?: OrderBy;
  wasEverPopular?: OrderBy;
  isFunny?: OrderBy;
  mentorNames?: OrderBy;
  menteeNames?: OrderBy;
  address?: OrderBy;
  businessAddress?: OrderBy;
  quotes?: OrderBy;
  numberOfAtoms?: OrderBy;
  deletedAt?: OrderBy;
  numberOfPublicReviews?: OrderBy;
  numberOfPublicReviews2?: OrderBy;
  tagsOfAllBooks?: OrderBy;
  search?: OrderBy;
  certificate?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  rangeOfBooks?: OrderBy;
  favoriteColors?: OrderBy;
  favoriteShape?: OrderBy;
  mentor?: AuthorOrder;
  rootMentor?: AuthorOrder;
  currentDraftBook?: BookOrder;
  favoriteBook?: BookOrder;
  publisher?: PublisherOrder;
}

export interface AuthorFactoryExtras {
  withNumberOfBooks?: number;
  withBookComments?: string | null;
  withNickNamesUpper?: string[] | null;
  withMentorNames?: string | null;
  withMenteeNames?: string | null;
  withNumberOfPublicReviews?: number | null;
  withNumberOfPublicReviews2?: number | null;
  withTagsOfAllBooks?: string | null;
  withSearch?: string | null;
  withRangeOfBooks?: BookRange | null;
}

export const authorConfig = new ConfigApi<Author, Context>();

authorConfig.addRule(newRequiredRule("firstName"));
authorConfig.addRule(newRequiredRule("initials"));
authorConfig.addRule("numberOfBooks", newRequiredRule("numberOfBooks"));
authorConfig.addRule(newRequiredRule("isFunny"));
authorConfig.addRule(newRequiredRule("createdAt"));
authorConfig.addRule(newRequiredRule("updatedAt"));
authorConfig.setDefault("isFunny", false);

declare module "joist-orm" {
  interface TypeMap {
    Author: {
      entityType: Author;
      filterType: AuthorFilter;
      gqlFilterType: AuthorGraphQLFilter;
      orderType: AuthorOrder;
      optsType: AuthorOpts;
      fieldsType: AuthorFields;
      optIdsType: AuthorIdsOpts;
      factoryExtrasType: AuthorFactoryExtras;
      factoryOptsType: Parameters<typeof newAuthor>[1];
    };
  }
}

export abstract class AuthorCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "a";
  static readonly metadata: EntityMetadata<Author>;

  declare readonly __type: { 0: "Author" };

  abstract readonly rootMentor: ReactiveReference<Author, Author, undefined>;
  abstract readonly favoriteBook: ReactiveReference<Author, Book, undefined>;
  abstract readonly menteesClosure: ReactiveManyToMany<Author, Author>; // author_to_mentees_closure mentor_id mentee_id
  abstract readonly bestReviews: ReactiveManyToMany<Author, BookReview>; // authors_to_best_reviews author_id book_review_id

  readonly mentees: Collection<Author, Author> = hasMany();
  readonly books: Collection<Author, Book> = hasMany();
  readonly reviewerBooks: Collection<Author, Book> = hasMany();
  readonly schedules: Collection<Author, AuthorSchedule> = hasMany();
  readonly comments: Collection<Author, Comment> = hasMany();
  readonly spotlightAuthorPublishers: Collection<Author, Publisher> = hasMany();
  readonly tasks: Collection<Author, TaskNew> = hasMany();
  readonly mentor: ManyToOneReference<Author, Author, undefined> = hasOne();
  readonly currentDraftBook: ManyToOneReference<Author, Book, undefined> = hasOne();
  readonly publisher: ManyToOneReference<Author, Publisher, undefined> = hasOne();
  readonly mentorsRecursive: ReadOnlyCollection<Author, Author> = hasRecursiveParents("mentor", "menteesRecursive");
  readonly menteesRecursive: ReadOnlyCollection<Author, Author> = hasRecursiveChildren("mentees", "mentorsRecursive");
  readonly image: OneToOneReference<Author, Image> = hasOneToOne();
  readonly userOneToOne: OneToOneReference<Author, User> = hasOneToOne();
  readonly mentorsClosure: ReactiveManyToManyOtherSide<Author, Author> = hasReactiveManyToManyOtherSide(); // author_to_mentees_closure mentee_id mentor_id
  readonly tags: Collection<Author, Tag> = hasManyToMany(); // authors_to_tags author_id tag_id

  get id(): AuthorId {
    return this.idMaybe || failNoIdYet("Author");
  }

  get idMaybe(): AuthorId | undefined {
    return toIdOf(authorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Author");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get firstName(): string {
    return getField(this, "firstName");
  }

  set firstName(firstName: string) {
    setField(this, "firstName", firstName);
  }

  get lastName(): string | undefined {
    return getField(this, "lastName");
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", lastName);
  }

  get ssn(): string | undefined {
    return getField(this, "ssn");
  }

  set ssn(ssn: string | undefined) {
    setField(this, "ssn", ssn);
  }

  abstract get initials(): string;

  abstract readonly numberOfBooks: ReactiveField<Author, number>;

  abstract readonly bookComments: ReactiveField<Author, string | undefined>;

  get isPopular(): boolean | undefined {
    return getField(this, "isPopular");
  }

  set isPopular(isPopular: boolean | undefined) {
    setField(this, "isPopular", isPopular);
  }

  get age(): number | undefined {
    return getField(this, "age");
  }

  set age(age: number | undefined) {
    setField(this, "age", age);
  }

  get graduated(): Date | undefined {
    return getField(this, "graduated");
  }

  set graduated(graduated: Date | undefined) {
    setField(this, "graduated", graduated);
  }

  get nickNames(): string[] | undefined {
    return getField(this, "nickNames");
  }

  set nickNames(nickNames: string[] | undefined) {
    setField(this, "nickNames", nickNames);
  }

  abstract readonly nickNamesUpper: ReactiveField<Author, string[] | undefined>;

  get wasEverPopular(): boolean | undefined {
    return getField(this, "wasEverPopular");
  }

  protected setWasEverPopular(wasEverPopular: boolean | undefined) {
    setField(this, "wasEverPopular", wasEverPopular);
  }

  get isFunny(): boolean {
    return getField(this, "isFunny");
  }

  set isFunny(isFunny: boolean) {
    setField(this, "isFunny", isFunny);
  }

  abstract readonly mentorNames: ReactiveField<Author, string | undefined>;

  abstract readonly menteeNames: ReactiveField<Author, string | undefined>;

  get address(): Address | undefined {
    return getField(this, "address");
  }

  set address(value: Address | undefined) {
    if (value) {
      assert(value, address);
    }
    setField(this, "address", value);
  }

  get businessAddress(): z.output<typeof AddressSchema> | undefined {
    return getField(this, "businessAddress");
  }

  set businessAddress(value: z.input<typeof AddressSchema> | undefined) {
    if (value) {
      setField(this, "businessAddress", AddressSchema.parse(value));
    } else {
      setField(this, "businessAddress", value);
    }
  }

  get quotes(): Quotes | undefined {
    return getField(this, "quotes");
  }

  set quotes(value: Quotes | undefined) {
    if (value) {
      assert(value, quotes);
    }
    setField(this, "quotes", value);
  }

  get numberOfAtoms(): bigint | undefined {
    return getField(this, "numberOfAtoms");
  }

  set numberOfAtoms(numberOfAtoms: bigint | undefined) {
    setField(this, "numberOfAtoms", numberOfAtoms);
  }

  get deletedAt(): Date | undefined {
    return getField(this, "deletedAt");
  }

  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }

  abstract readonly numberOfPublicReviews: ReactiveField<Author, number | undefined>;

  abstract readonly numberOfPublicReviews2: ReactiveField<Author, number | undefined>;

  abstract readonly tagsOfAllBooks: ReactiveField<Author, string | undefined>;

  abstract readonly search: ReactiveField<Author, string | undefined>;

  get certificate(): Uint8Array | undefined {
    return getField(this, "certificate");
  }

  set certificate(certificate: Uint8Array | undefined) {
    setField(this, "certificate", certificate);
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  abstract readonly rangeOfBooks: ReactiveField<Author, BookRange | undefined>;

  get isFew(): boolean {
    return getField(this, "rangeOfBooks") === BookRange.Few;
  }

  get isLot(): boolean {
    return getField(this, "rangeOfBooks") === BookRange.Lot;
  }

  get favoriteColors(): Color[] {
    return getField(this, "favoriteColors") || [];
  }

  get favoriteColorsDetails(): ColorDetails[] {
    return this.favoriteColors.map((code) => Colors.getByCode(code));
  }

  set favoriteColors(favoriteColors: Color[]) {
    setField(this, "favoriteColors", favoriteColors);
  }

  get isRed(): boolean {
    return this.favoriteColors.includes(Color.Red);
  }

  get isGreen(): boolean {
    return this.favoriteColors.includes(Color.Green);
  }

  get isBlue(): boolean {
    return this.favoriteColors.includes(Color.Blue);
  }

  get favoriteShape(): FavoriteShape | undefined {
    return getField(this, "favoriteShape");
  }

  set favoriteShape(favoriteShape: FavoriteShape | undefined) {
    setField(this, "favoriteShape", favoriteShape);
  }

  get isCircle(): boolean {
    return this.favoriteShape === FavoriteShape.Circle;
  }

  get isSquare(): boolean {
    return this.favoriteShape === FavoriteShape.Square;
  }

  get isTriangle(): boolean {
    return this.favoriteShape === FavoriteShape.Triangle;
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<AuthorOpts>): void {
    setOpts(this as any as Author, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<AuthorOpts>): void {
    setOpts(this as any as Author, opts as OptsOf<Author>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setDeepPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   *   books: [{ title: "b1" }], // create a child book
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Author>): Promise<void> {
    return updatePartial(this as any as Author, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Author> {
    return newChangesProxy(this) as any;
  }

  get isSoftDeletedEntity(): boolean {
    return this.deletedAt !== undefined;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Author, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Author>>(hint: H): Promise<Loaded<Author, H>>;
  populate<const H extends LoadHint<Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Author, H>>;
  populate<const H extends LoadHint<Author>, V>(hint: H, fn: (a: Loaded<Author, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (a: Loaded<Author, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Author>, V>(
    hintOrOpts: any,
    fn?: (a: Loaded<Author, H>) => V,
  ): Promise<Loaded<Author, H> | V> {
    return this.em.populate(this as any as Author, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Author>>(hint: H): this is Loaded<Author, H> {
    return isLoaded(this as any as Author, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint.
   *
   * Note: As the hint might load, this returns a Promise
   *
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see {@link https://joist-orm.io/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Author>>(hint: H): Promise<JsonPayload<Author, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
