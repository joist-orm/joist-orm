import {
  BaseEntity,
  type Changes,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasMany,
  hasOne,
  hasReactiveManyToManyOtherSide,
  hasRecursiveChildren,
  hasRecursiveParents,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  newScopeFn,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type ReactiveManyToMany,
  type ReactiveManyToManyOtherSide,
  type ReadOnlyCollection,
  type Scope,
  setField,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import { type Employee, employeeMeta, type Entity, EntityManager, newEmployee } from "../entities";

export type EmployeeId = Flavor<string, "Employee">;

export interface EmployeeFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  name: { kind: "primitive"; type: string; unique: false; nullable: never; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  manager: { kind: "m2o"; type: Employee; nullable: undefined; derived: false };
  managersClosure: { kind: "m2m"; type: Employee };
  managerOfClosure: { kind: "m2m"; type: Employee };
  reports: { kind: "o2m"; type: Employee };
}

export interface EmployeeOpts {
  name: string;
  manager?: Employee | EmployeeId | null;
  reports?: Employee[];
}

export interface EmployeeIdsOpts {
  managerId?: EmployeeId | null;
  reportIds?: EmployeeId[] | null;
}

export interface EmployeeFilter {
  id?: ValueFilter<EmployeeId, never> | null;
  name?: ValueFilter<string, never>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  manager?: EntityFilter<Employee, EmployeeId, FilterOf<Employee>, null>;
  reports?: EntityFilter<Employee, EmployeeId, FilterOf<Employee>, null | undefined>;
  managersClosure?: EntityFilter<Employee, EmployeeId, FilterOf<Employee>, null | undefined>;
  managerOfClosure?: EntityFilter<Employee, EmployeeId, FilterOf<Employee>, null | undefined>;
}

export interface EmployeeGraphQLFilter {
  id?: ValueGraphQLFilter<EmployeeId>;
  name?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  manager?: EntityGraphQLFilter<Employee, EmployeeId, GraphQLFilterOf<Employee>, null>;
  managerId?: ValueGraphQLFilter<EmployeeId>;
  reports?: EntityGraphQLFilter<Employee, EmployeeId, GraphQLFilterOf<Employee>, null | undefined>;
  managersClosure?: EntityGraphQLFilter<Employee, EmployeeId, GraphQLFilterOf<Employee>, null | undefined>;
  managerOfClosure?: EntityGraphQLFilter<Employee, EmployeeId, GraphQLFilterOf<Employee>, null | undefined>;
}

export interface EmployeeOrder {
  id?: OrderBy;
  name?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  manager?: EmployeeOrder;
}

export interface EmployeeFactoryExtras {
}

export interface EmployeeScopes {
}

export type EmployeeScope = Scope<Employee, EmployeeScopes>;

export const employeeConfig = new ConfigApi<Employee, Context>();

export const employeeScope = newScopeFn<Employee, EmployeeScope>("Employee");

employeeConfig.addRule(newRequiredRule("name"));
employeeConfig.addRule(newRequiredRule("createdAt"));
employeeConfig.addRule(newRequiredRule("updatedAt"));

declare module "joist-core" {
  interface TypeMap {
    Employee: {
      entityType: Employee;
      filterType: EmployeeFilter;
      gqlFilterType: EmployeeGraphQLFilter;
      orderType: EmployeeOrder;
      optsType: EmployeeOpts;
      fieldsType: EmployeeFields;
      optIdsType: EmployeeIdsOpts;
      factoryExtrasType: EmployeeFactoryExtras;
      factoryOptsType: Parameters<typeof newEmployee>[1];
    };
  }
}

export abstract class EmployeeCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "e";
  static readonly metadata: EntityMetadata<Employee>;

  declare readonly __type: { 0: "Employee" };

  abstract readonly managersClosure: ReactiveManyToMany<Employee, Employee>; // employee_to_managers_closure employee_id manager_id

  readonly reports: Collection<Employee, Employee> = hasMany();
  readonly manager: ManyToOneReference<Employee, Employee, undefined> = hasOne();
  readonly managersRecursive: ReadOnlyCollection<Employee, Employee> = hasRecursiveParents(
    "manager",
    "reportsRecursive",
  );
  readonly reportsRecursive: ReadOnlyCollection<Employee, Employee> = hasRecursiveChildren(
    "reports",
    "managersRecursive",
  );
  readonly managerOfClosure: ReactiveManyToManyOtherSide<Employee, Employee> = hasReactiveManyToManyOtherSide(); // employee_to_managers_closure manager_id employee_id

  get id(): EmployeeId {
    return this.idMaybe || failNoIdYet("Employee");
  }

  get idMaybe(): EmployeeId | undefined {
    return toIdOf(employeeMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Employee");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get name(): string {
    return getField(this, "name");
  }

  set name(name: string) {
    setField(this, "name", name);
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<EmployeeOpts>): void {
    setOpts(this as any as Employee, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<EmployeeOpts>): void {
    setOpts(this as any as Employee, opts as OptsOf<Employee>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
   * @example
   * ```
   * entity.setDeepPartial({
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   *   books: [{ title: "b1" }], // create a child book
   * });
   * ```
   * @see {@link https://joist-orm.io/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Employee>): Promise<void> {
    return updatePartial(this as any as Employee, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<Employee> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Employee>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Employee, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Employee>>(hint: H): Promise<Loaded<Employee, H>>;
  populate<const H extends LoadHint<Employee>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Employee, H>>;
  populate<const H extends LoadHint<Employee>, V>(hint: H, fn: (e: Loaded<Employee, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Employee>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (e: Loaded<Employee, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Employee>, V>(
    hintOrOpts: any,
    fn?: (e: Loaded<Employee, H>) => V,
  ): Promise<Loaded<Employee, H> | V> {
    return this.em.populate(this as any as Employee, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Employee>>(hint: H): this is Loaded<Employee, H> {
    return isLoaded(this as any as Employee, hint);
  }

  /**
   * Build a type-safe, loadable and relation aware POJO from this entity, given a hint.
   *
   * Note: As the hint might load, this returns a Promise
   *
   * @example
   * ```
   * const payload = await a.toJSON({
   *   id: true,
   *   books: { id: true, reviews: { rating: true } }
   * });
   * ```
   * @see {@link https://joist-orm.io/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Employee>>(hint: H): Promise<JsonPayload<Employee, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
