import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityManager,
  Flavor,
  getEm,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { Author, authorMeta, newAuthor } from "./entities";

export type AuthorId = Flavor<string, "Author">;

export interface AuthorOpts {
  id?: string | null;
  firstName: string;
  lastName?: string | null;
}

export interface AuthorIdsOpts {}

export interface AuthorFilter {
  id?: ValueFilter<AuthorId, never>;
  id?: ValueFilter<string, null | undefined>;
  firstName?: ValueFilter<string, never>;
  lastName?: ValueFilter<string, null | undefined>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
}

export interface AuthorGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorId>;
  id?: ValueGraphQLFilter<string>;
  firstName?: ValueGraphQLFilter<string>;
  lastName?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
}

export interface AuthorOrder {
  id?: OrderBy;
  id?: OrderBy;
  firstName?: OrderBy;
  lastName?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const authorConfig = new ConfigApi<Author, Context>();

authorConfig.addRule(newRequiredRule("firstName"));
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

  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, authorMeta, {}, opts);
    setOpts(this as any as Author, opts, { calledFromConstructor: true });
  }

  get id(): AuthorId | undefined {
    return this.__orm.data["id"];
  }

  get id(): string | undefined {
    return this.__orm.data["id"];
  }

  set id(id: string | undefined) {
    setField(this, "id", id);
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

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
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
