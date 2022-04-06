import {
  BaseEntity,
  Changes,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { EntityManager } from "src/entities";
import {
  Author,
  AuthorFavorite,
  authorFavoriteMeta,
  AuthorId,
  authorMeta,
  AuthorOrder,
  FavoriteThing,
  FavoriteThingId,
  favoriteThingMeta,
  FavoriteThingOrder,
  newAuthorFavorite,
} from "./entities";

export type AuthorFavoriteId = Flavor<string, "AuthorFavorite">;

export interface AuthorFavoriteOpts {
  author: Author;
  favoriteThing: FavoriteThing;
}

export interface AuthorFavoriteIdsOpts {
  authorId?: AuthorId | null;
  favoriteThingId?: FavoriteThingId | null;
}

export interface AuthorFavoriteFilter {
  id?: ValueFilter<AuthorFavoriteId, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  author?: EntityFilter<Author, AuthorId, FilterOf<Author>, never>;
  favoriteThing?: EntityFilter<FavoriteThing, FavoriteThingId, FilterOf<FavoriteThing>, never>;
}

export interface AuthorFavoriteGraphQLFilter {
  id?: ValueGraphQLFilter<AuthorFavoriteId>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  author?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>>;
  favoriteThing?: EntityGraphQLFilter<FavoriteThing, FavoriteThingId, GraphQLFilterOf<FavoriteThing>>;
}

export interface AuthorFavoriteOrder {
  id?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  author?: AuthorOrder;
  favoriteThing?: FavoriteThingOrder;
}

export const authorFavoriteConfig = new ConfigApi<AuthorFavorite, Context>();

authorFavoriteConfig.addRule(newRequiredRule("createdAt"));
authorFavoriteConfig.addRule(newRequiredRule("updatedAt"));
authorFavoriteConfig.addRule(newRequiredRule("author"));
authorFavoriteConfig.addRule(newRequiredRule("favoriteThing"));

export abstract class AuthorFavoriteCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
    filterType: AuthorFavoriteFilter;
    gqlFilterType: AuthorFavoriteGraphQLFilter;
    orderType: AuthorFavoriteOrder;
    optsType: AuthorFavoriteOpts;
    optIdsType: AuthorFavoriteIdsOpts;
    factoryOptsType: Parameters<typeof newAuthorFavorite>[1];
  };

  readonly author: ManyToOneReference<AuthorFavorite, Author, never> = hasOne(authorMeta, "author", "favorites");

  readonly favoriteThing: ManyToOneReference<AuthorFavorite, FavoriteThing, never> = hasOne(
    favoriteThingMeta,
    "favoriteThing",
    "authorFavorites",
  );

  constructor(em: EntityManager, opts: AuthorFavoriteOpts) {
    super(em, authorFavoriteMeta, AuthorFavoriteCodegen.defaultValues, opts);
    setOpts(this as any as AuthorFavorite, opts, { calledFromConstructor: true });
  }

  get id(): AuthorFavoriteId | undefined {
    return this.__orm.data["id"];
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<AuthorFavoriteOpts>): void {
    setOpts(this as any as AuthorFavorite, opts);
  }

  setPartial(opts: PartialOrNull<AuthorFavoriteOpts>): void {
    setOpts(this as any as AuthorFavorite, opts as OptsOf<AuthorFavorite>, { partial: true });
  }

  get changes(): Changes<AuthorFavorite> {
    return newChangesProxy(this as any as AuthorFavorite);
  }

  async load<U, V>(fn: (lens: Lens<AuthorFavorite>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as AuthorFavorite, fn);
  }

  async populate<H extends LoadHint<AuthorFavorite>>(hint: H): Promise<Loaded<AuthorFavorite, H>> {
    return this.em.populate(this as any as AuthorFavorite, hint);
  }

  isLoaded<H extends LoadHint<AuthorFavorite>>(hint: H): this is Loaded<AuthorFavorite, H> {
    return isLoaded(this as any as AuthorFavorite, hint);
  }
}
