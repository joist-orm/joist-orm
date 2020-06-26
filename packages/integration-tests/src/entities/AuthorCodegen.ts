import {
  Flavor,
  ValueFilter,
  ValueGraphQLFilter,
  OrderBy,
  ConfigApi,
  BaseEntity,
  EntityManager,
  setOpts,
  OptsOf,
  PartialOrNull,
  Changes,
  newChangesProxy,
  Lens,
  loadLens,
  LoadHint,
  Loaded,
  getEm,
  BooleanFilter,
  EntityFilter,
  FilterOf,
  BooleanGraphQLFilter,
  EntityGraphQLFilter,
  GraphQLFilterOf,
  newRequiredRule,
  Collection,
  OneToManyCollection,
  Reference,
  ManyToOneReference,
  setField,
} from "joist-orm";
import { Author, authorMeta, Publisher, Book, PublisherId, PublisherOrder, bookMeta } from "./entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorOpts {
  firstName: string;
  lastName?: string | null;
  isPopular?: boolean | null;
  age?: number | null;
  wasEverPopular?: boolean | null;
  mentor?: Author | null;
  publisher?: Publisher | null;
  authors?: Author[];
  books?: Book[];
}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never>;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null | undefined>;
  initials?: ValueFilter<string, never>;
  numberOfBooks?: ValueFilter<number, never>;
  isPopular?: BooleanFilter<null | undefined>;
  age?: ValueFilter<number, null | undefined>;
  wasEverPopular?: BooleanFilter<null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  mentor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null | undefined>;
  publisher?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorId>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  initials?: ValueGraphQLFilter<string>;
  numberOfBooks?: ValueGraphQLFilter<number>;
  isPopular?: BooleanGraphQLFilter;
  age?: ValueGraphQLFilter<number>;
  wasEverPopular?: BooleanGraphQLFilter;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  mentor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
  publisher?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>>;
}

export interface AuthorOrder {
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  initials?: OrderBy;
  numberOfBooks?: OrderBy;
  isPopular?: OrderBy;
  age?: OrderBy;
  wasEverPopular?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  mentor?: AuthorOrder;
  publisher?: PublisherOrder;
}

export const authorConfig = new ConfigApi<Author>();

authorConfig.addRule(newRequiredRule("firstName"));
authorConfig.addRule(newRequiredRule("initials"));
authorConfig.addRule(newRequiredRule("numberOfBooks"));
authorConfig.addRule(newRequiredRule("createdAt"));
authorConfig.addRule(newRequiredRule("updatedAt"));

export abstract class AuthorCodegen extends BaseEntity {
  readonly __filterType: AuthorFilter = null!;
  readonly __gqlFilterType: AuthorGraphQLFilter = null!;
  readonly __orderType: AuthorOrder = null!;
  readonly __optsType: AuthorOpts = null!;

  readonly authors: Collection<Author, Author> = new OneToManyCollection(
    this as any,
    authorMeta,
    "authors",
    "mentor",
    "mentor_id",
  );

  readonly books: Collection<Author, Book> = new OneToManyCollection(
    this as any,
    bookMeta,
    "books",
    "author",
    "author_id",
  );

  readonly mentor: Reference<Author, Author, undefined> = new ManyToOneReference<Author, Author, undefined>(
    this as any,
    Author,
    "mentor",
    "authors",
    false,
  );

  readonly publisher: Reference<Author, Publisher, undefined> = new ManyToOneReference<Author, Publisher, undefined>(
    this as any,
    Publisher,
    "publisher",
    "authors",
    false,
  );

  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, authorMeta);
    this.set(opts as AuthorOpts, { calledFromConstructor: true } as any);
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

  get wasEverPopular(): boolean | undefined {
    return this.__orm.data["wasEverPopular"];
  }

  protected setWasEverPopular(wasEverPopular: boolean | undefined) {
    setField(this, "wasEverPopular", wasEverPopular);
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(values: Partial<AuthorOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, opts);
  }

  setPartial(values: PartialOrNull<AuthorOpts>, opts: { ignoreUndefined?: boolean } = {}): void {
    setOpts(this, values as OptsOf<this>, { ignoreUndefined: true, ...opts });
  }

  get changes(): Changes<Author> {
    return newChangesProxy((this as any) as Author);
  }

  async load<U, V>(fn: (lens: Lens<Author>) => Lens<U, V>): Promise<V> {
    return loadLens((this as any) as Author, fn);
  }

  async populate<H extends LoadHint<Author>>(hint: H): Promise<Loaded<Author, H>> {
    return getEm(this).populate((this as any) as Author, hint);
  }
}
