import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityManager,
  EnumGraphQLFilter,
  FilterOf,
  Flavor,
  getEm,
  GraphQLFilterOf,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  OrmApi,
  PartialOrNull,
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
  Color,
  ColorDetails,
  Colors,
  Image,
  ImageId,
  imageMeta,
  newAuthor,
  Publisher,
  PublisherId,
  publisherMeta,
  PublisherOrder,
} from "./entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  isPopular?: boolean | null;
  age?: number | null;
  graduated?: Date | null;
  wasEverPopular?: boolean | null;
  address?: Address | null;
  favoriteColors?: Color[];
  mentor?: Author | null;
  publisher?: Publisher | null;
  image?: Image | null;
  authors?: Author[];
  books?: Book[];
}

export interface AuthorIdsOpts {
  mentorId?: AuthorId | null;
  publisherId?: PublisherId | null;
  imageId?: ImageId | null;
  authorIds?: AuthorId[] | null;
  bookIds?: BookId[] | null;
}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never>;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null | undefined>;
  initials?: ValueFilter<string, never>;
  numberOfBooks?: ValueFilter<number, never>;
  isPopular?: BooleanFilter<null | undefined>;
  age?: ValueFilter<number, null | undefined>;
  graduated?: ValueFilter<Date, null | undefined>;
  wasEverPopular?: BooleanFilter<null | undefined>;
  address?: ValueFilter<Address, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  favoriteColors?: ValueFilter<Color[], null | undefined>;
  mentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
  image?: EntityFilter<Image, ImageId, FilterOf<Image>, null | undefined>;
}

export interface AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  initials?: ValueGraphQLFilter<string>;
  numberOfBooks?: ValueGraphQLFilter<number>;
  isPopular?: BooleanGraphQLFilter;
  age?: ValueGraphQLFilter<number>;
  graduated?: ValueGraphQLFilter<Date>;
  wasEverPopular?: BooleanGraphQLFilter;
  address?: ValueGraphQLFilter<Address>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  favoriteColors?: EnumGraphQLFilter<Color>;
  mentor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>>;
  image?: EntityGraphQLFilter<Image, ImageId, GraphQLFilterOf<Image>>;
}

export interface AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  initials?: OrderBy;
  numberOfBooks?: OrderBy;
  isPopular?: OrderBy;
  age?: OrderBy;
  graduated?: OrderBy;
  wasEverPopular?: OrderBy;
  address?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  favoriteColors?: OrderBy;
  mentor?: AuthorOrder;
  publisher?: PublisherOrder;
}

export const authorConfig = new ConfigApi<Author, Context>();

authorConfig.addRule(newRequiredRule("firstName"));
authorConfig.addRule(newRequiredRule("initials"));
authorConfig.addRule(newRequiredRule("numberOfBooks"));
authorConfig.addRule(newRequiredRule("createdAt"));
authorConfig.addRule(newRequiredRule("updatedAt"));

export abstract class AuthorCodegen extends BaseEntity {
  readonly __types: {
    filterType: AuthorFilter;
    gqlFilterType: AuthorGraphQLFilter;
    orderType: AuthorOrder;
    optsType: AuthorOpts;
    optIdsType: AuthorIdsOpts;
    factoryOptsType: Parameters<typeof newAuthor>[1];
  } = null!;
  protected readonly orm = new OrmApi(this as any as Author);

  readonly authors = this.orm.hasMany(authorMeta, "authors", "mentor", "mentor_id");

  readonly books = this.orm.hasMany(bookMeta, "books", "author", "author_id");

  readonly mentor = this.orm.hasOne(authorMeta, "mentor", "authors", false);

  readonly publisher = this.orm.hasOne(publisherMeta, "publisher", "authors", false);

  readonly image = this.orm.hasOneToOne(imageMeta, "image", "author", "author_id");

  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, authorMeta, {}, opts);
    setOpts(this as any as Author, opts, { calledFromConstructor: true });
  }

  get id(): AuthorId | undefined {
    return this.__orm.data["id"];
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

  get numberOfBooks(): number {
    if (!("numberOfBooks" in this.__orm.data)) {
      throw new Error("numberOfBooks has not been derived yet");
    }
    return this.__orm.data["numberOfBooks"];
  }

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

  set(opts: Partial<AuthorOpts>): void {
    setOpts(this as any as Author, opts);
  }

  setPartial(opts: PartialOrNull<AuthorOpts>): void {
    setOpts(this as any as Author, opts as OptsOf<Author>, { partial: true });
  }

  get changes(): Changes<Author> {
    return newChangesProxy(this as any as Author);
  }

  async load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as Author, fn);
  }

  async populate<H extends LoadHint<Author>>(hint: H): Promise<Loaded<Author, H>> {
    return getEm(this).populate(this as any as Author, hint);
  }
}
