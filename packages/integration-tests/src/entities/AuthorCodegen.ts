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
export type AuthorId = Flavor<string, "Author">;
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
  wasEverPopular: { kind: "primitive"; type: boolean; unique: false; nullable: undefined };
  address: { kind: "primitive"; type: Address; unique: false; nullable: undefined };
  businessAddress: { kind: "primitive"; type: z.input<typeof AddressSchema>; unique: false; nullable: undefined };
  quotes: { kind: "primitive"; type: Quotes; unique: false; nullable: undefined };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined };
  numberOfPublicReviews: { kind: "primitive"; type: number; unique: false; nullable: undefined };
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
  wasEverPopular?: boolean | null;
  address?: Address | null;
  businessAddress?: z.input<typeof AddressSchema> | null;
  quotes?: Quotes | null;
  deletedAt?: Date | null;
  favoriteColors?: Color[];
  favoriteShape?: FavoriteShape | null;
  mentor?: Author | AuthorId | null;
  currentDraftBook?: Book | BookId | null;
  publisher?: Publisher | PublisherId | null;
  image?: Image | null;
  userOneToOne?: User | null;
  authors?: Author[];
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
  wasEverPopular?: BooleanFilter<null>;
  address?: ValueFilter<Address, null>;
  businessAddress?: ValueFilter<z.input<typeof AddressSchema>, null>;
  quotes?: ValueFilter<Quotes, null>;
  deletedAt?: ValueFilter<Date, null>;
  numberOfPublicReviews?: ValueFilter<number, null>;
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
  wasEverPopular?: BooleanGraphQLFilter;
  address?: ValueGraphQLFilter<Address>;
  businessAddress?: ValueGraphQLFilter<z.input<typeof AddressSchema>>;
  quotes?: ValueGraphQLFilter<Quotes>;
  deletedAt?: ValueGraphQLFilter<Date>;
  numberOfPublicReviews?: ValueGraphQLFilter<number>;
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
  wasEverPopular?: OrderBy;
  address?: OrderBy;
  businessAddress?: OrderBy;
  quotes?: OrderBy;
  deletedAt?: OrderBy;
  numberOfPublicReviews?: OrderBy;
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
export abstract class AuthorCodegen extends BaseEntity<EntityManager> {
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
  readonly authors: Collection<Author, Author> = hasMany(authorMeta, "authors", "mentor", "mentor_id", undefined);
  readonly books: Collection<Author, Book> = hasMany(bookMeta, "books", "author", "author_id", {
    "field": "order",
    "direction": "ASC",
  });
  readonly comments: Collection<Author, Comment> = hasMany(
    commentMeta,
    "comments",
    "parent",
    "parent_author_id",
    undefined,
  );
  readonly mentor: ManyToOneReference<Author, Author, undefined> = hasOne(authorMeta, "mentor", "authors");
  readonly currentDraftBook: ManyToOneReference<Author, Book, undefined> = hasOne(
    bookMeta,
    "currentDraftBook",
    "currentDraftAuthor",
  );
  abstract readonly favoriteBook: PersistedAsyncReference<Author, Book, undefined>;
  readonly publisher: ManyToOneReference<Author, Publisher, undefined> = hasOne(publisherMeta, "publisher", "authors");
  readonly image: OneToOneReference<Author, Image> = hasOneToOne(imageMeta, "image", "author", "author_id");
  readonly userOneToOne: OneToOneReference<Author, User> = hasOneToOne(
    userMeta,
    "userOneToOne",
    "authorManyToOne",
    "author_id",
  );
  readonly tags: Collection<Author, Tag> = hasManyToMany(
    "authors_to_tags",
    "tags",
    "author_id",
    tagMeta,
    "authors",
    "tag_id",
  );
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, authorMeta, AuthorCodegen.defaultValues, opts);
    setOpts((this as any) as Author, opts, { calledFromConstructor: true });
  }
  get id(): AuthorId | undefined {
    return this.idTagged;
  }
  get idOrFail(): AuthorId {
    return this.id || fail("Author has no id yet");
  }
  get idTagged(): AuthorId | undefined {
    return this.__orm.data["id"];
  }
  get idTaggedOrFail(): AuthorId {
    return this.idTagged || fail("Author has no id tagged yet");
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
  get deletedAt(): Date | undefined {
    return this.__orm.data["deletedAt"];
  }
  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }
  abstract readonly numberOfPublicReviews: PersistedAsyncProperty<Author, number | undefined>;
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
    setOpts((this as any) as Author, opts);
  }
  setPartial(opts: PartialOrNull<AuthorOpts>): void {
    setOpts((this as any) as Author, opts as OptsOf<Author>, { partial: true });
  }
  get changes(): Changes<Author> {
    return (newChangesProxy(this) as any);
  }
  get isSoftDeletedEntity(): boolean {
    return this.__orm.data.deletedAt !== undefined;
  }
  load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens((this as any) as Author, fn, opts);
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
    return this.em.populate((this as any) as Author, hintOrOpts, fn);
  }
  isLoaded<H extends LoadHint<Author>>(hint: H): this is Loaded<Author, H> {
    return isLoaded((this as any) as Author, hint);
  }
}
