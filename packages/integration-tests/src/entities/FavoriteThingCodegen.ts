import {
  BaseEntity,
  Changes,
  Collection,
  ConfigApi,
  Entity,
  EntityConstructor,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  Flavor,
  hasMany,
  hasOnePolymorphic,
  IdOf,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PolymorphicReference,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import { EntityManager } from "src/entities";
import {
  Author,
  AuthorFavorite,
  AuthorFavoriteId,
  authorFavoriteMeta,
  Book,
  FavoriteThing,
  favoriteThingMeta,
  newFavoriteThing,
  Publisher,
} from "./entities";

export type FavoriteThingId = Flavor<string, "FavoriteThing">;

export type FavoriteThingParent = Author | Book | Publisher;
export function getFavoriteThingParentConstructors(): EntityConstructor<FavoriteThingParent>[] {
  return [Author, Book, Publisher];
}
export function isFavoriteThingParent(maybeEntity: Entity | undefined | null): maybeEntity is FavoriteThingParent {
  return (
    maybeEntity !== undefined &&
    maybeEntity !== null &&
    getFavoriteThingParentConstructors().some((type) => maybeEntity instanceof type)
  );
}

export interface FavoriteThingOpts {
  parent: FavoriteThingParent;
  authorFavorites?: AuthorFavorite[];
}

export interface FavoriteThingIdsOpts {
  parentId?: IdOf<FavoriteThingParent> | null;
  authorFavoriteIds?: AuthorFavoriteId[] | null;
}

export interface FavoriteThingFilter {
  id?: ValueFilter<FavoriteThingId, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  parent?: EntityFilter<FavoriteThingParent, IdOf<FavoriteThingParent>, never, null | undefined>;
}

export interface FavoriteThingGraphQLFilter {
  id?: ValueGraphQLFilter<FavoriteThingId>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  parent?: EntityGraphQLFilter<FavoriteThingParent, IdOf<FavoriteThingParent>, never>;
}

export interface FavoriteThingOrder {
  id?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
}

export const favoriteThingConfig = new ConfigApi<FavoriteThing, Context>();

favoriteThingConfig.addRule(newRequiredRule("createdAt"));
favoriteThingConfig.addRule(newRequiredRule("updatedAt"));
favoriteThingConfig.addRule(newRequiredRule("parent"));

export abstract class FavoriteThingCodegen extends BaseEntity<EntityManager> {
  static defaultValues: object = {};

  readonly __orm!: EntityOrmField & {
    filterType: FavoriteThingFilter;
    gqlFilterType: FavoriteThingGraphQLFilter;
    orderType: FavoriteThingOrder;
    optsType: FavoriteThingOpts;
    optIdsType: FavoriteThingIdsOpts;
    factoryOptsType: Parameters<typeof newFavoriteThing>[1];
  };

  readonly authorFavorites: Collection<FavoriteThing, AuthorFavorite> = hasMany(
    authorFavoriteMeta,
    "authorFavorites",
    "favoriteThing",
    "favorite_thing_id",
  );

  readonly parent: PolymorphicReference<FavoriteThing, FavoriteThingParent, never> = hasOnePolymorphic("parent");

  constructor(em: EntityManager, opts: FavoriteThingOpts) {
    super(em, favoriteThingMeta, FavoriteThingCodegen.defaultValues, opts);
    setOpts(this as any as FavoriteThing, opts, { calledFromConstructor: true });
  }

  get id(): FavoriteThingId | undefined {
    return this.__orm.data["id"];
  }

  get createdAt(): Date {
    return this.__orm.data["createdAt"];
  }

  get updatedAt(): Date {
    return this.__orm.data["updatedAt"];
  }

  set(opts: Partial<FavoriteThingOpts>): void {
    setOpts(this as any as FavoriteThing, opts);
  }

  setPartial(opts: PartialOrNull<FavoriteThingOpts>): void {
    setOpts(this as any as FavoriteThing, opts as OptsOf<FavoriteThing>, { partial: true });
  }

  get changes(): Changes<FavoriteThing> {
    return newChangesProxy(this as any as FavoriteThing);
  }

  async load<U, V>(fn: (lens: Lens<FavoriteThing>) => Lens<U, V>): Promise<V> {
    return loadLens(this as any as FavoriteThing, fn);
  }

  async populate<H extends LoadHint<FavoriteThing>>(hint: H): Promise<Loaded<FavoriteThing, H>> {
    return this.em.populate(this as any as FavoriteThing, hint);
  }

  isLoaded<H extends LoadHint<FavoriteThing>>(hint: H): this is Loaded<FavoriteThing, H> {
    return isLoaded(this as any as FavoriteThing, hint);
  }
}
