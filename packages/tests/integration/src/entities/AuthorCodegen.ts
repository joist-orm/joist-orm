import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  cleanStringValue,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  FilterOf,
  Flavor,
  getField,
  getOrmField,
  GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OneToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PersistedAsyncReference,
  ReactiveField,
  setField,
  setOpts,
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Address, address, AddressSchema, Quotes, quotes } from "src/entities/types";
import { assert } from "superstruct";
import { z } from "zod";
import {
  Author,
  authorMeta,
  AuthorSchedule,
  AuthorScheduleId,
  authorScheduleMeta,
  Book,
  BookId,
  bookMeta,
  BookOrder,
  Color,
  ColorDetails,
  Colors,
  Comment,
  CommentId,
  commentMeta,
  Entity,
  EntityManager,
  FavoriteShape,
  Image,
  ImageId,
  imageMeta,
  newAuthor,
  Publisher,
  PublisherId,
  publisherMeta,
  PublisherOrder,
  Tag,
  TagId,
  tagMeta,
  User,
  UserId,
  userMeta,
} from "./entities";

export type AuthorId = Flavor<string, Author>;

export interface AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
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
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  favoriteColors: { kind: "enum"; type: Color[]; nullable: never };
  favoriteShape: { kind: "enum"; type: FavoriteShape; nullable: undefined; native: true };
  mentor: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  currentDraftBook: { kind: "m2o"; type: Book; nullable: undefined; derived: false };
  favoriteBook: { kind: "m2o"; type: Book; nullable: undefined; derived: true };
  publisher: { kind: "m2o"; type: Publisher; nullable: undefined; derived: false };
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
  address?: Address | null;
  businessAddress?: z.input<typeof AddressSchema> | null;
  quotes?: Quotes | null;
  numberOfAtoms?: bigint | null;
  deletedAt?: Date | null;
  favoriteColors?: Color[];
  favoriteShape?: FavoriteShape | null;
  mentor?: Author | AuthorId | null;
  currentDraftBook?: Book | BookId | null;
  publisher?: Publisher | PublisherId | null;
  image?: Image | null;
  userOneToOne?: User | null;
  authors?: Author[];
  schedules?: AuthorSchedule[];
  books?: Book[];
  comments?: Comment[];
  tags?: Tag[];
}

export interface AuthorIdsOpts {
  mentorId?: AuthorId | null;
  currentDraftBookId?: BookId | null;
  publisherId?: PublisherId | null;
  imageId?: ImageId | null;
  userOneToOneId?: UserId | null;
  authorIds?: AuthorId[] | null;
  scheduleIds?: AuthorScheduleId[] | null;
  bookIds?: BookId[] | null;
  commentIds?: CommentId[] | null;
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
  address?: ValueFilter<Address, null>;
  businessAddress?: ValueFilter<z.input<typeof AddressSchema>, null>;
  quotes?: ValueFilter<Quotes, null>;
  numberOfAtoms?: ValueFilter<bigint, null>;
  deletedAt?: ValueFilter<Date, null>;
  numberOfPublicReviews?: ValueFilter<number, null>;
  numberOfPublicReviews2?: ValueFilter<number, null>;
  tagsOfAllBooks?: ValueFilter<string, null>;
  search?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  favoriteColors?: ValueFilter<Color[], null>;
  favoriteShape?: ValueFilter<FavoriteShape, null>;
  mentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  currentDraftBook?: EntityFilter<Book, BookId, FilterOf<Book>, null>;
  favoriteBook?: EntityFilter<Book, BookId, FilterOf<Book>, null>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
  userOneToOne?: EntityFilter<User, UserId, FilterOf<User>, null | undefined>;
  authors?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  schedules?: EntityFilter<AuthorSchedule, AuthorScheduleId, FilterOf<AuthorSchedule>, null | undefined>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
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
  address?: ValueGraphQLFilter<Address>;
  businessAddress?: ValueGraphQLFilter<z.input<typeof AddressSchema>>;
  quotes?: ValueGraphQLFilter<Quotes>;
  numberOfAtoms?: ValueGraphQLFilter<bigint>;
  deletedAt?: ValueGraphQLFilter<Date>;
  numberOfPublicReviews?: ValueGraphQLFilter<number>;
  numberOfPublicReviews2?: ValueGraphQLFilter<number>;
  tagsOfAllBooks?: ValueGraphQLFilter<string>;
  search?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  favoriteColors?: ValueGraphQLFilter<Color[]>;
  favoriteShape?: ValueGraphQLFilter<FavoriteShape>;
  mentor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  currentDraftBook?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null>;
  favoriteBook?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null>;
  image?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>, null | undefined>;
  userOneToOne?: EntityGraphQLFilter<User, UserId, GraphQLFilterOf<User>, null | undefined>;
  authors?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  schedules?: EntityGraphQLFilter<AuthorSchedule, AuthorScheduleId, GraphQLFilterOf<AuthorSchedule>, null | undefined>;
  books?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
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
  address?: OrderBy;
  businessAddress?: OrderBy;
  quotes?: OrderBy;
  numberOfAtoms?: OrderBy;
  deletedAt?: OrderBy;
  numberOfPublicReviews?: OrderBy;
  numberOfPublicReviews2?: OrderBy;
  tagsOfAllBooks?: OrderBy;
  search?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  favoriteColors?: OrderBy;
  favoriteShape?: OrderBy;
  mentor?: AuthorOrder;
  currentDraftBook?: BookOrder;
  favoriteBook?: BookOrder;
  publisher?: PublisherOrder;
}

export const authorConfig = new ConfigApi<Author, Context>();

authorConfig.addRule(newRequiredRule("firstName"));
authorConfig.addRule(newRequiredRule("initials"));
authorConfig.addRule(newRequiredRule("numberOfBooks"));
authorConfig.addRule(newRequiredRule("createdAt"));
authorConfig.addRule(newRequiredRule("updatedAt"));

export abstract class AuthorCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static defaultValues: object = {};
  static readonly tagName = "a";
  static readonly metadata: EntityMetadata<Author>;

  declare readonly __orm: EntityOrmField & {
    filterType: AuthorFilter;
    gqlFilterType: AuthorGraphQLFilter;
    orderType: AuthorOrder;
    optsType: AuthorOpts;
    fieldsType: AuthorFields;
    optIdsType: AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newAuthor>[1];
  };

  abstract readonly favoriteBook: PersistedAsyncReference<Author, Book, undefined>;

  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, authorMeta, AuthorCodegen.defaultValues, opts);
    setOpts(this as any as Author, opts, { calledFromConstructor: true });
  }

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
    setField(this, "firstName", cleanStringValue(firstName));
  }

  get lastName(): string | undefined {
    return getField(this, "lastName");
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", cleanStringValue(lastName));
  }

  get ssn(): string | undefined {
    return getField(this, "ssn");
  }

  set ssn(ssn: string | undefined) {
    setField(this, "ssn", cleanStringValue(ssn));
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

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
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

  set(opts: Partial<AuthorOpts>): void {
    setOpts(this as any as Author, opts);
  }

  setPartial(opts: PartialOrNull<AuthorOpts>): void {
    setOpts(this as any as Author, opts as OptsOf<Author>, { partial: true });
  }

  get changes(): Changes<Author> {
    return newChangesProxy(this) as any;
  }

  get isSoftDeletedEntity(): boolean {
    return getField(this, "deletedAt", true) !== undefined;
  }

  load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Author, fn, opts);
  }

  populate<H extends LoadHint<Author>>(hint: H): Promise<Loaded<Author, H>>;
  populate<H extends LoadHint<Author>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Author, H>>;
  populate<H extends LoadHint<Author>, V>(hint: H, fn: (a: Loaded<Author, H>) => V): Promise<V>;
  populate<H extends LoadHint<Author>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (a: Loaded<Author, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<Author>, V>(
    hintOrOpts: any,
    fn?: (a: Loaded<Author, H>) => V,
  ): Promise<Loaded<Author, H> | V> {
    return this.em.populate(this as any as Author, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<Author>>(hint: H): this is Loaded<Author, H> {
    return isLoaded(this as any as Author, hint);
  }

  get authors(): Collection<Author, Author> {
    const { relations } = getOrmField(this);
    return relations.authors ??= hasMany(
      this as any as Author,
      authorMeta,
      "authors",
      "mentor",
      "mentor_id",
      undefined,
    );
  }

  get schedules(): Collection<Author, AuthorSchedule> {
    const { relations } = getOrmField(this);
    return relations.schedules ??= hasMany(
      this as any as Author,
      authorScheduleMeta,
      "schedules",
      "author",
      "author_id",
      undefined,
    );
  }

  get books(): Collection<Author, Book> {
    const { relations } = getOrmField(this);
    return relations.books ??= hasMany(this as any as Author, bookMeta, "books", "author", "author_id", {
      "field": "order",
      "direction": "ASC",
    });
  }

  get comments(): Collection<Author, Comment> {
    const { relations } = getOrmField(this);
    return relations.comments ??= hasMany(
      this as any as Author,
      commentMeta,
      "comments",
      "parent",
      "parent_author_id",
      undefined,
    );
  }

  get mentor(): ManyToOneReference<Author, Author, undefined> {
    const { relations } = getOrmField(this);
    return relations.mentor ??= hasOne(this as any as Author, authorMeta, "mentor", "authors");
  }

  get currentDraftBook(): ManyToOneReference<Author, Book, undefined> {
    const { relations } = getOrmField(this);
    return relations.currentDraftBook ??= hasOne(
      this as any as Author,
      bookMeta,
      "currentDraftBook",
      "currentDraftAuthor",
    );
  }

  get publisher(): ManyToOneReference<Author, Publisher, undefined> {
    const { relations } = getOrmField(this);
    return relations.publisher ??= hasOne(this as any as Author, publisherMeta, "publisher", "authors");
  }

  get image(): OneToOneReference<Author, Image> {
    const { relations } = getOrmField(this);
    return relations.image ??= hasOneToOne(this as any as Author, imageMeta, "image", "author", "author_id");
  }

  get userOneToOne(): OneToOneReference<Author, User> {
    const { relations } = getOrmField(this);
    return relations.userOneToOne ??= hasOneToOne(
      this as any as Author,
      userMeta,
      "userOneToOne",
      "authorManyToOne",
      "author_id",
    );
  }

  get tags(): Collection<Author, Tag> {
    const { relations } = getOrmField(this);
    return relations.tags ??= hasManyToMany(
      this as any as Author,
      "authors_to_tags",
      "tags",
      "author_id",
      tagMeta,
      "authors",
      "tag_id",
    );
  }
}
