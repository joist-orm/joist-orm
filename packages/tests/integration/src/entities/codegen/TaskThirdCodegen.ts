import {
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
  hasRecursiveChildren,
  hasRecursiveParents,
  isLoaded,
  type JsonPayload,
  type Lens,
  type Loaded,
  type LoadHint,
  loadLens,
  type ManyToOneReference,
  mustBeSubType,
  newChangesProxy,
  newScopeFn,
  type OptsOf,
  type PartialOrNull,
  type ReadOnlyCollection,
  type RecursiveCollectionFilter,
  type Scope,
  setOpts,
  type TaggedId,
  toIdOf,
  toJSON,
  type ToJsonHint,
  updatePartial,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  type Entity,
  newTaskThird,
  type Tag,
  Task,
  type TaskColumns,
  type TaskFields,
  type TaskFilter,
  type TaskGraphQLFilter,
  type TaskIdsOpts,
  type TaskItem,
  type TaskOpts,
  type TaskOrder,
  type TaskThird,
  taskThirdMeta,
} from "../entities";

export type TaskThirdId = Flavor<string, "Task">;

export interface TaskThirdFields extends Omit<TaskFields, "id" | "copiedFrom"> {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  copiedFrom: { kind: "m2o"; type: TaskThird; nullable: undefined; derived: false };
  copiedTo: { kind: "o2m"; type: TaskThird };
}

export interface TaskThirdColumns extends TaskColumns {
}

export interface TaskThirdOpts extends TaskOpts {
  copiedTo?: TaskThird[];
}

export interface TaskThirdIdsOpts extends TaskIdsOpts {
  copiedFromId?: TaskThirdId | null;
  copiedToIds?: TaskThirdId[] | null;
}

export interface TaskThirdFilter extends TaskFilter {
  copiedFrom?: EntityFilter<TaskThird, TaskThirdId, FilterOf<TaskThird>, null>;
  copiedTo?: EntityFilter<TaskThird, TaskThirdId, FilterOf<TaskThird>, null | undefined>;
  copiedFromsRecursive?: RecursiveCollectionFilter<TaskThird>;
  copiedToRecursive?: RecursiveCollectionFilter<TaskThird>;
}

export interface TaskThirdGraphQLFilter extends TaskGraphQLFilter {
  copiedFrom?: EntityGraphQLFilter<TaskThird, TaskThirdId, GraphQLFilterOf<TaskThird>, null>;
  copiedFromId?: ValueGraphQLFilter<TaskThirdId>;
  copiedTo?: EntityGraphQLFilter<TaskThird, TaskThirdId, GraphQLFilterOf<TaskThird>, null | undefined>;
}

export interface TaskThirdOrder extends TaskOrder {
  copiedFrom?: TaskThirdOrder;
}

export interface TaskThirdFactoryExtras {
}

export interface TaskThirdScopes {
}

export type TaskThirdScope = Scope<TaskThird, TaskThirdScopes>;

export const taskThirdConfig = new ConfigApi<TaskThird, Context>();

export const taskThirdScope = newScopeFn<TaskThird, TaskThirdScope>("TaskThird");

taskThirdConfig.addRule("copiedFrom", mustBeSubType("copiedFrom"));
taskThirdConfig.addRule("copiedFrom", mustBeSubType("copiedFrom"));

declare module "joist-core" {
  interface TypeMap {
    TaskThird: {
      entityType: TaskThird;
      filterType: TaskThirdFilter;
      gqlFilterType: TaskThirdGraphQLFilter;
      orderType: TaskThirdOrder;
      optsType: TaskThirdOpts;
      fieldsType: TaskThirdFields;
      columnsType: TaskThirdColumns;
      inheritanceType: "sti";
      supportsEmExecute: false;
      optIdsType: TaskThirdIdsOpts;
      factoryExtrasType: TaskThirdFactoryExtras;
      factoryOptsType: Parameters<typeof newTaskThird>[1];
    };
  }
}

export abstract class TaskThirdCodegen extends Task implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<TaskThird>;

  declare readonly __type: { 0: "Task"; 1: "TaskThird" };

  readonly copiedTo: Collection<TaskThird, TaskThird> = hasMany();
  readonly copiedFrom: ManyToOneReference<TaskThird, TaskThird, undefined> = hasOne();
  readonly copiedFromsRecursive: ReadOnlyCollection<TaskThird, TaskThird> = hasRecursiveParents(
    "copiedFrom",
    "copiedToRecursive",
  );
  readonly copiedToRecursive: ReadOnlyCollection<TaskThird, TaskThird> = hasRecursiveChildren(
    "copiedTo",
    "copiedFromsRecursive",
  );
  declare readonly taskTaskItems: Collection<TaskThird, TaskItem>;
  declare readonly tags: Collection<TaskThird, Tag>;

  get id(): TaskThirdId {
    return this.idMaybe || failNoIdYet("TaskThird");
  }

  get idMaybe(): TaskThirdId | undefined {
    return toIdOf(taskThirdMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("TaskThird");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
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
  set(opts: Partial<TaskThirdOpts>): void {
    setOpts(this as any as TaskThird, opts);
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
  setPartial(opts: PartialOrNull<TaskThirdOpts>): void {
    setOpts(this as any as TaskThird, opts as OptsOf<TaskThird>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<TaskThird>): Promise<void> {
    return updatePartial(this as any as TaskThird, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<TaskThird> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<TaskThird>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskThird, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<TaskThird>>(hint: H): Promise<Loaded<TaskThird, H>>;
  populate<const H extends LoadHint<TaskThird>>(
    opts: { hint: H; forceReload?: boolean },
  ): Promise<Loaded<TaskThird, H>>;
  populate<const H extends LoadHint<TaskThird>, V>(hint: H, fn: (task: Loaded<TaskThird, H>) => V): Promise<V>;
  populate<const H extends LoadHint<TaskThird>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (task: Loaded<TaskThird, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<TaskThird>, V>(
    hintOrOpts: any,
    fn?: (task: Loaded<TaskThird, H>) => V,
  ): Promise<Loaded<TaskThird, H> | V> {
    return this.em.populate(this as any as TaskThird, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<TaskThird>>(hint: H): this is Loaded<TaskThird | Task, H> {
    return isLoaded(this as any as TaskThird, hint);
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
  toJSON<const H extends ToJsonHint<TaskThird>>(hint: H): Promise<JsonPayload<TaskThird, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
