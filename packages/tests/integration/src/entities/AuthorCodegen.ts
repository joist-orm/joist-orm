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
  fail,
  FilterOf,
  Flavor,
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
  PersistedAsyncProperty,
  PersistedAsyncReference,
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
import type { EntityManager } from "./entities";

export type AuthorId = Flavor<string, Author>;

export interface AuthorFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: false };
  firstName: { kind: "primitive"; type: string; unique: false; nullable: never };
  lastName: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  ssn: { kind: "primitive"; type: string; unique: true; nullable: undefined };
  initials: { kind: "primitive"; type: string; unique: false; nullable: never };
  numberOfBooks: { kind: "primitive"; type: number; unique: false; nullable: never };
  bookComments: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  isPopular: { kind: "primitive"; type: boolean; unique: false; nullable: undefined };
  age: { kind: "primitive"; type: number; unique: false; nullable: undefined };
  graduated: { kind: "primitive"; type: Date; unique: false; nullable: undefined };
  nickNames: { kind: "primitive"; type: string[]; unique: false; nullable: undefined };
  wasEverPopular: { kind: "primitive"; type: boolean; unique: false; nullable: undefined };
  address: { kind: "primitive"; type: Address; unique: false; nullable: undefined };
  businessAddress: { kind: "primitive"; type: z.input<typeof AddressSchema>; unique: false; nullable: undefined };
  quotes: { kind: "primitive"; type: Quotes; unique: false; nullable: undefined };
  numberOfAtoms: { kind: "primitive"; type: bigint; unique: false; nullable: undefined };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined };
  numberOfPublicReviews: { kind: "primitive"; type: number; unique: false; nullable: undefined };
  numberOfPublicReviews2: { kind: "primitive"; type: number; unique: false; nullable: undefined };
  tagsOfAllBooks: { kind: "primitive"; type: string; unique: false; nullable: undefined };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never };
  favoriteColors: { kind: "enum"; type: Color[]; nullable: never };
  favoriteShape: { kind: "enum"; type: FavoriteShape; nullable: undefined; native: true };
  mentor: { kind: "m2o"; type: Author; nullable: undefined };
  currentDraftBook: { kind: "m2o"; type: Book; nullable: undefined };
  favoriteBook: { kind: "m2o"; type: Book; nullable: undefined };
  publisher: { kind: "m2o"; type: Publisher; nullable: undefined };
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
  id?: ValueFilter<AuthorId, never>;
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
  wasEverPopular?: BooleanFilter<null>;
  address?: ValueFilter<Address, null>;
  businessAddress?: ValueFilter<z.input<typeof AddressSchema>, null>;
  quotes?: ValueFilter<Quotes, null>;
  numberOfAtoms?: ValueFilter<bigint, null>;
  deletedAt?: ValueFilter<Date, null>;
  numberOfPublicReviews?: ValueFilter<number, null>;
  numberOfPublicReviews2?: ValueFilter<number, null>;
  tagsOfAllBooks?: ValueFilter<string, null>;
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
  wasEverPopular?: BooleanGraphQLFilter;
  address?: ValueGraphQLFilter<Address>;
  businessAddress?: ValueGraphQLFilter<z.input<typeof AddressSchema>>;
  quotes?: ValueGraphQLFilter<Quotes>;
  numberOfAtoms?: ValueGraphQLFilter<bigint>;
  deletedAt?: ValueGraphQLFilter<Date>;
  numberOfPublicReviews?: ValueGraphQLFilter<number>;
  numberOfPublicReviews2?: ValueGraphQLFilter<number>;
  tagsOfAllBooks?: ValueGraphQLFilter<string>;
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
  wasEverPopular?: OrderBy;
  address?: OrderBy;
  businessAddress?: OrderBy;
  quotes?: OrderBy;
  numberOfAtoms?: OrderBy;
  deletedAt?: OrderBy;
  numberOfPublicReviews?: OrderBy;
  numberOfPublicReviews2?: OrderBy;
  tagsOfAllBooks?: OrderBy;
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

export abstract class AuthorCodegen extends BaseEntity<EntityManager, string> {
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
    return this.idMaybe || fail("Author has no id yet");
  }

  get idMaybe(): AuthorId | undefined {
    return toIdOf(authorMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || fail("Author has no id yet");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return this.__orm.data["id"];
  }

  get firstName(): string {
    return this.__orm.data["firstName"];
  }

  set firstName(firstName: string) {
    setField(this, "firstName", cleanStringValue(firstName));
  }

  get lastName(): string | undefined {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", cleanStringValue(lastName));
  }

  get ssn(): string | undefined {
    return this.__orm.data["ssn"];
  }

  set ssn(ssn: string | undefined) {
    setField(this, "ssn", cleanStringValue(ssn));
  }

  abstract get initials(): string;

  abstract readonly numberOfBooks: PersistedAsyncProperty<Author, number>;

  abstract readonly bookComments: PersistedAsyncProperty<Author, string | undefined>;

  get isPopular(): boolean | undefined {
    return this.__orm.data["isPopular"];
  }

  set isPopular(isPopular: boolean | undefined) {
    setField(this, "isPopular", isPopular);
  }

  get age(): number | undefined {
    return this.__orm.data["age"];
  }

  set age(age: number | undefined) {
    setField(this, "age", age);
  }

  get graduated(): Date | undefined {
    return this.__orm.data["graduated"];
  }

  set graduated(graduated: Date | undefined) {
    setField(this, "graduated", graduated);
  }

  get nickNames(): string[] | undefined {
    return this.__orm.data["nickNames"];
  }

  set nickNames(nickNames: string[] | undefined) {
    setField(this, "nickNames", nickNames);
  }

  get wasEverPopular(): boolean | undefined {
    return this.__orm.data["wasEverPopular"];
  }

  protected setWasEverPopular(wasEverPopular: boolean | undefined) {
    setField(this, "wasEverPopular", wasEverPopular);
  }

  get address(): Address | undefined {
    return this.__orm.data["address"];
  }

  set address(_address: Address | undefined) {
    if (_address) {
      assert(_address, address);
    }
    setField(this, "address", _address);
  }

  get businessAddress(): z.output<typeof AddressSchema> | undefined {
    return this.__orm.data["businessAddress"];
  }

  set businessAddress(_businessAddress: z.input<typeof AddressSchema> | undefined) {
    if (_businessAddress) {
      setField(this, "businessAddress", AddressSchema.parse(_businessAddress));
    } else {
      setField(this, "businessAddress", _businessAddress);
    }
  }

  get quotes(): Quotes | undefined {
    return this.__orm.data["quotes"];
  }

  set quotes(_quotes: Quotes | undefined) {
    if (_quotes) {
      assert(_quotes, quotes);
    }
    setField(this, "quotes", _quotes);
  }

  get numberOfAtoms(): bigint | undefined {
    return this.__orm.data["numberOfAtoms"];
  }

  set numberOfAtoms(numberOfAtoms: bigint | undefined) {
    setField(this, "numberOfAtoms", numberOfAtoms);
  }

  get deletedAt(): Date | undefined {
    return this.__orm.data["deletedAt"];
  }

  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }

  abstract readonly numberOfPublicReviews: PersistedAsyncProperty<Author, number | undefined>;

  abstract readonly numberOfPublicReviews2: PersistedAsyncProperty<Author, number | undefined>;

  abstract readonly tagsOfAllBooks: PersistedAsyncProperty<Author, string | undefined>;

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  get favoriteColors(): Color[] {
    return this.__orm.data["favoriteColors"] || [];
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
    return this.__orm.data["favoriteShape"];
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
    return this.__orm.data.deletedAt !== undefined;
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
    const { relations } = this.__orm;
    if (relations.authors === undefined) {
      relations.authors = hasMany(this as any as Author, authorMeta, "authors", "mentor", "mentor_id", undefined);
      if (this.isNewEntity) {
        relations.authors.initializeForNewEntity?.();
      }
    }
    return relations.authors as any;
  }

  get schedules(): Collection<Author, AuthorSchedule> {
    const { relations } = this.__orm;
    if (relations.schedules === undefined) {
      relations.schedules = hasMany(
        this as any as Author,
        authorScheduleMeta,
        "schedules",
        "author",
        "author_id",
        undefined,
      );
      if (this.isNewEntity) {
        relations.schedules.initializeForNewEntity?.();
      }
    }
    return relations.schedules as any;
  }

  get books(): Collection<Author, Book> {
    const { relations } = this.__orm;
    if (relations.books === undefined) {
      relations.books = hasMany(this as any as Author, bookMeta, "books", "author", "author_id", {
        "field": "order",
        "direction": "ASC",
      });
      if (this.isNewEntity) {
        relations.books.initializeForNewEntity?.();
      }
    }
    return relations.books as any;
  }

  get comments(): Collection<Author, Comment> {
    const { relations } = this.__orm;
    if (relations.comments === undefined) {
      relations.comments = hasMany(
        this as any as Author,
        commentMeta,
        "comments",
        "parent",
        "parent_author_id",
        undefined,
      );
      if (this.isNewEntity) {
        relations.comments.initializeForNewEntity?.();
      }
    }
    return relations.comments as any;
  }

  get mentor(): ManyToOneReference<Author, Author, undefined> {
    const { relations } = this.__orm;
    if (relations.mentor === undefined) {
      relations.mentor = hasOne(this as any as Author, authorMeta, "mentor", "authors");
      if (this.isNewEntity) {
        relations.mentor.initializeForNewEntity?.();
      }
    }
    return relations.mentor as any;
  }

  get currentDraftBook(): ManyToOneReference<Author, Book, undefined> {
    const { relations } = this.__orm;
    if (relations.currentDraftBook === undefined) {
      relations.currentDraftBook = hasOne(this as any as Author, bookMeta, "currentDraftBook", "currentDraftAuthor");
      if (this.isNewEntity) {
        relations.currentDraftBook.initializeForNewEntity?.();
      }
    }
    return relations.currentDraftBook as any;
  }

  get publisher(): ManyToOneReference<Author, Publisher, undefined> {
    const { relations } = this.__orm;
    if (relations.publisher === undefined) {
      relations.publisher = hasOne(this as any as Author, publisherMeta, "publisher", "authors");
      if (this.isNewEntity) {
        relations.publisher.initializeForNewEntity?.();
      }
    }
    return relations.publisher as any;
  }

  get image(): OneToOneReference<Author, Image> {
    const { relations } = this.__orm;
    if (relations.image === undefined) {
      relations.image = hasOneToOne(this as any as Author, imageMeta, "image", "author", "author_id");
      if (this.isNewEntity) {
        relations.image.initializeForNewEntity?.();
      }
    }
    return relations.image as any;
  }

  get userOneToOne(): OneToOneReference<Author, User> {
    const { relations } = this.__orm;
    if (relations.userOneToOne === undefined) {
      relations.userOneToOne = hasOneToOne(
        this as any as Author,
        userMeta,
        "userOneToOne",
        "authorManyToOne",
        "author_id",
      );
      if (this.isNewEntity) {
        relations.userOneToOne.initializeForNewEntity?.();
      }
    }
    return relations.userOneToOne as any;
  }

  get tags(): Collection<Author, Tag> {
    const { relations } = this.__orm;
    if (relations.tags === undefined) {
      relations.tags = hasManyToMany(
        this as any as Author,
        "authors_to_tags",
        "tags",
        "author_id",
        tagMeta,
        "authors",
        "tag_id",
      );
      if (this.isNewEntity) {
        relations.tags.initializeForNewEntity?.();
      }
    }
    return relations.tags as any;
  }
}
