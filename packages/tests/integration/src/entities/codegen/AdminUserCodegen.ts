import {
  type Changes,
  cleanStringValue,
  ConfigApi,
  type EntityMetadata,
  failNoIdYet,
  type Flavor,
  getField,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  AdminUser,
  adminUserMeta,
  type Entity,
  EntityManager,
  newAdminUser,
  User,
  type UserFields,
  type UserFilter,
  type UserGraphQLFilter,
  type UserIdsOpts,
  type UserOpts,
  type UserOrder,
} from "../entities";

export type AdminUserId = Flavor<string, AdminUser> & Flavor<string, "User">;

export interface AdminUserFields extends UserFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  role: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
}

export interface AdminUserOpts extends UserOpts {
  role: string;
}

export interface AdminUserIdsOpts extends UserIdsOpts {
}

export interface AdminUserFilter extends UserFilter {
  role?: ValueFilter<string, never>;
}

export interface AdminUserGraphQLFilter extends UserGraphQLFilter {
  role?: ValueGraphQLFilter<string>;
}

export interface AdminUserOrder extends UserOrder {
  role?: OrderBy;
}

export const adminUserConfig = new ConfigApi<AdminUser, Context>();

adminUserConfig.addRule(newRequiredRule("role"));

export abstract class AdminUserCodegen extends User implements Entity {
  static readonly tagName = "u";
  static readonly metadata: EntityMetadata<AdminUser>;

  declare readonly __orm: {
    entityType: AdminUser;
    filterType: AdminUserFilter;
    gqlFilterType: AdminUserGraphQLFilter;
    orderType: AdminUserOrder;
    optsType: AdminUserOpts;
    fieldsType: AdminUserFields;
    optIdsType: AdminUserIdsOpts;
    factoryOptsType: Parameters<typeof newAdminUser>[1];
  };

  constructor(em: EntityManager, opts: AdminUserOpts) {
    super(em, opts);
    setOpts(this as any as AdminUser, opts, { calledFromConstructor: true });
  }

  get id(): AdminUserId {
    return this.idMaybe || failNoIdYet("AdminUser");
  }

  get idMaybe(): AdminUserId | undefined {
    return toIdOf(adminUserMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("AdminUser");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get role(): string {
    return getField(this, "role");
  }

  set role(role: string) {
    setField(this, "role", cleanStringValue(role));
  }

  /**
   * Partial update taking any subset of the entities fields.
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   * @example
   * ```
   * entity.setPartial({
   *  firstName: 'foo' // updated
   *  lastName: undefined // do nothing
   *  age: null // unset, (i.e. set it as undefined)
   * })
   * ```
   * @see @{link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<AdminUserOpts>): void {
    setOpts(this as any as AdminUser, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   * @example
   * ```
   * entity.setPartial({
   *  firstName: 'foo' // updated
   *  lastName: undefined // do nothing
   *  age: null // unset, (i.e. set it as undefined)
   * })
   * ```
   * @see @{link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<AdminUserOpts>): void {
    setOpts(this as any as AdminUser, opts as OptsOf<AdminUser>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   * @see @{link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<AdminUser> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens
   */
  load<U, V>(fn: (lens: Lens<AdminUser>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as AdminUser, fn, opts);
  }

  /**
   * Traverse from this entity using a lens, and load the result
   * @see @{link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  populate<const H extends LoadHint<AdminUser>>(hint: H): Promise<Loaded<AdminUser, H>>;
  populate<const H extends LoadHint<AdminUser>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<AdminUser, H>>;
  populate<const H extends LoadHint<AdminUser>, V>(hint: H, fn: (u: Loaded<AdminUser, H>) => V): Promise<V>;
  populate<const H extends LoadHint<AdminUser>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (u: Loaded<AdminUser, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<AdminUser>, V>(
    hintOrOpts: any,
    fn?: (u: Loaded<AdminUser, H>) => V,
  ): Promise<Loaded<AdminUser, H> | V> {
    return this.em.populate(this as any as AdminUser, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work. Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<AdminUser>>(hint: H): this is Loaded<AdminUser | User, H> {
    return isLoaded(this as any as AdminUser, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint
   * Note: As the hint might load, this returns a Promise
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see @{link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<AdminUser>>(hint: H): Promise<JsonPayload<AdminUser, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
