import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  EnumGraphQLFilter,
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
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Address, address } from "src/entities/types";
import { assert } from "superstruct";
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
} from "./entities";
import type { EntityManager } from "./entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorFields {
  firstName: string;
  lastName: string | undefined;
  initials: string;
  numberOfBooks: number;
  bookComments: string | undefined;
  isPopular: boolean | undefined;
  age: number | undefined;
  graduated: Date | undefined;
  wasEverPopular: boolean | undefined;
  address: Address | undefined;
  deletedAt: Date | undefined;
  numberOfPublicReviews: number | undefined;
  createdAt: Date;
  updatedAt: Date;
  favoriteColors: Color[];
  favoriteShape: FavoriteShape | undefined;
  mentor: Author | undefined;
  currentDraftBook: Book | undefined;
  publisher: Publisher | undefined;
}

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  isPopular?: boolean | null;
  age?: number | null;
  graduated?: Date | null;
  wasEverPopular?: boolean | null;
  address?: Address | null;
  deletedAt?: Date | null;
  favoriteColors?: Color[];
  favoriteShape?: FavoriteShape | null;
  mentor?: Author | AuthorId | null;
  currentDraftBook?: Book | BookId | null;
  publisher?: Publisher | PublisherId | null;
  image?: Image | null;
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
  authorIds?: AuthorId[] | null;
  bookIds?: BookId[] | null;
  commentIds?: CommentId[] | null;
  tagIds?: TagId[] | null;
}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never>;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null | undefined>;
  initials?: ValueFilter<string, never>;
  numberOfBooks?: ValueFilter<number, never>;
  bookComments?: ValueFilter<string, null | undefined>;
  isPopular?: BooleanFilter<null | undefined>;
  age?: ValueFilter<number, null | undefined>;
  graduated?: ValueFilter<Date, null | undefined>;
  wasEverPopular?: BooleanFilter<null | undefined>;
  address?: ValueFilter<Address, null | undefined>;
  deletedAt?: ValueFilter<Date, null | undefined>;
  numberOfPublicReviews?: ValueFilter<number, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  favoriteColors?: ValueFilter<Color[], null | undefined>;
  favoriteShape?: ValueFilter<FavoriteShape, null | undefined>;
  mentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  currentDraftBook?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
  authors?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  books?: EntityFilter<Book, BookId, FilterOf<Book>, null | undefined>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
}

export interface AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  initials?: ValueGraphQLFilter<string>;
  numberOfBooks?: ValueGraphQLFilter<number>;
  bookComments?: ValueGraphQLFilter<string>;
  isPopular?: BooleanGraphQLFilter;
  age?: ValueGraphQLFilter<number>;
  graduated?: ValueGraphQLFilter<Date>;
  wasEverPopular?: BooleanGraphQLFilter;
  address?: ValueGraphQLFilter<Address>;
  deletedAt?: ValueGraphQLFilter<Date>;
  numberOfPublicReviews?: ValueGraphQLFilter<number>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  favoriteColors?: EnumGraphQLFilter<Color>;
  favoriteShape?: EnumGraphQLFilter<FavoriteShape>;
  mentor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null | undefined>;
  currentDraftBook?: EntityGraphQLFilter<Book, BookId, GraphQLFilterOf<Book>, null | undefined>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
  image?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>, null | undefined>;
}

export interface AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  initials?: OrderBy;
  numberOfBooks?: OrderBy;
  bookComments?: OrderBy;
  isPopular?: OrderBy;
  age?: OrderBy;
  graduated?: OrderBy;
  wasEverPopular?: OrderBy;
  address?: OrderBy;
  deletedAt?: OrderBy;
  numberOfPublicReviews?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  favoriteColors?: OrderBy;
  favoriteShape?: OrderBy;
  mentor?: AuthorOrder;
  currentDraftBook?: BookOrder;
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

  declare readonly __orm: EntityOrmField & {
    filterType: AuthorFilter;
    gqlFilterType: AuthorGraphQLFilter;
    orderType: AuthorOrder;
    optsType: AuthorOpts;
    fieldsType: AuthorFields;
    optIdsType: AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newAuthor>[1];
  };

  readonly authors: Collection<Author, Author> = hasMany(authorMeta, "authors", "mentor", "mentor_id");

  readonly books: Collection<Author, Book> = hasMany(bookMeta, "books", "author", "author_id");

  readonly comments: Collection<Author, Comment> = hasMany(commentMeta, "comments", "parent", "parent_author_id");

  readonly mentor: ManyToOneReference<Author, Author, undefined> = hasOne(authorMeta, "mentor", "authors");

  readonly currentDraftBook: ManyToOneReference<Author, Book, undefined> = hasOne(
    bookMeta,
    "currentDraftBook",
    "currentDraftAuthor",
  );

  readonly publisher: ManyToOneReference<Author, Publisher, undefined> = hasOne(publisherMeta, "publisher", "authors");

  readonly image: OneToOneReference<Author, Image> = hasOneToOne(imageMeta, "image", "author", "author_id");

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
    setOpts(this as any as Author, opts, { calledFromConstructor: true });
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
    setField(this, "firstName", firstName);
  }

  get lastName(): string | undefined {
    return this.__orm.data["lastName"];
  }

  set lastName(lastName: string | undefined) {
    setField(this, "lastName", lastName);
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

  load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Author, fn);
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
}
