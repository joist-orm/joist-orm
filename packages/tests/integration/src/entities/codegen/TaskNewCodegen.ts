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
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type ReadOnlyCollection,
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
import {
  Author,
  type AuthorId,
  authorMeta,
  type AuthorOrder,
  type Entity,
  EntityManager,
  newTaskNew,
  Tag,
  Task,
  type TaskFields,
  type TaskFilter,
  type TaskGraphQLFilter,
  type TaskIdsOpts,
  TaskItem,
  type TaskItemId,
  taskItemMeta,
  TaskNew,
  taskNewMeta,
  type TaskOpts,
  type TaskOrder,
} from "../entities";

export type TaskNewId = Flavor<string, "Task">;

export interface TaskNewFields extends TaskFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  specialNewField: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  selfReferential: { kind: "m2o"; type: TaskNew; nullable: undefined; derived: false };
  specialNewAuthor: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
  copiedFrom: { kind: "m2o"; type: TaskNew; nullable: undefined; derived: false };
  newTaskTaskItems: { kind: "o2m"; type: TaskItem };
  selfReferentialTasks: { kind: "o2m"; type: TaskNew };
  copiedTo: { kind: "o2m"; type: TaskNew };
}

export interface TaskNewOpts extends TaskOpts {
  specialNewField?: number | null;
  selfReferential?: TaskNew | TaskNewId | null;
  specialNewAuthor?: Author | AuthorId | null;
  newTaskTaskItems?: TaskItem[];
  selfReferentialTasks?: TaskNew[];
  copiedTo?: TaskNew[];
}

export interface TaskNewIdsOpts extends TaskIdsOpts {
  selfReferentialId?: TaskNewId | null;
  specialNewAuthorId?: AuthorId | null;
  copiedFromId?: TaskNewId | null;
  newTaskTaskItemIds?: TaskItemId[] | null;
  selfReferentialTaskIds?: TaskNewId[] | null;
  copiedToIds?: TaskNewId[] | null;
}

export interface TaskNewFilter extends TaskFilter {
  specialNewField?: ValueFilter<number, null>;
  selfReferential?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null>;
  specialNewAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  copiedFrom?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null>;
  newTaskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
  selfReferentialTasks?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null | undefined>;
  copiedTo?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null | undefined>;
}

export interface TaskNewGraphQLFilter extends TaskGraphQLFilter {
  specialNewField?: ValueGraphQLFilter<number>;
  selfReferential?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null>;
  specialNewAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  copiedFrom?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null>;
  newTaskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
  selfReferentialTasks?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null | undefined>;
  copiedTo?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null | undefined>;
}

export interface TaskNewOrder extends TaskOrder {
  specialNewField?: OrderBy;
  selfReferential?: TaskNewOrder;
  specialNewAuthor?: AuthorOrder;
  copiedFrom?: TaskNewOrder;
}

export interface TaskNewFactoryExtras {
}

export const taskNewConfig = new ConfigApi<TaskNew, Context>();

taskNewConfig.addRule("selfReferential", mustBeSubType("selfReferential"));
taskNewConfig.addRule("copiedFrom", mustBeSubType("copiedFrom"));
taskNewConfig.addRule("copiedFrom", mustBeSubType("copiedFrom"));

declare module "joist-orm" {
  interface TypeMap {
    TaskNew: {
      entityType: TaskNew;
      filterType: TaskNewFilter;
      gqlFilterType: TaskNewGraphQLFilter;
      orderType: TaskNewOrder;
      optsType: TaskNewOpts;
      fieldsType: TaskNewFields;
      optIdsType: TaskNewIdsOpts;
      factoryExtrasType: TaskNewFactoryExtras;
      factoryOptsType: Parameters<typeof newTaskNew>[1];
    };
  }
}

export abstract class TaskNewCodegen extends Task implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<TaskNew>;

  declare readonly __type: { 0: "Task"; 1: "TaskNew" };

  constructor(em: EntityManager, opts: TaskNewOpts) {
    super(em, opts);
    setOpts(this as any as TaskNew, opts, { calledFromConstructor: true });
  }

  get id(): TaskNewId {
    return this.idMaybe || failNoIdYet("TaskNew");
  }

  get idMaybe(): TaskNewId | undefined {
    return toIdOf(taskNewMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("TaskNew");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get specialNewField(): number | undefined {
    return getField(this, "specialNewField");
  }

  set specialNewField(specialNewField: number | undefined) {
    setField(this, "specialNewField", specialNewField);
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
  set(opts: Partial<TaskNewOpts>): void {
    setOpts(this as any as TaskNew, opts);
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
  setPartial(opts: PartialOrNull<TaskNewOpts>): void {
    setOpts(this as any as TaskNew, opts as OptsOf<TaskNew>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<TaskNew>): Promise<void> {
    return updatePartial(this as any as TaskNew, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<TaskNew> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<TaskNew>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskNew, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<TaskNew>>(hint: H): Promise<Loaded<TaskNew, H>>;
  populate<const H extends LoadHint<TaskNew>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<TaskNew, H>>;
  populate<const H extends LoadHint<TaskNew>, V>(hint: H, fn: (task: Loaded<TaskNew, H>) => V): Promise<V>;
  populate<const H extends LoadHint<TaskNew>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (task: Loaded<TaskNew, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<TaskNew>, V>(
    hintOrOpts: any,
    fn?: (task: Loaded<TaskNew, H>) => V,
  ): Promise<Loaded<TaskNew, H> | V> {
    return this.em.populate(this as any as TaskNew, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<TaskNew>>(hint: H): this is Loaded<TaskNew | Task, H> {
    return isLoaded(this as any as TaskNew, hint);
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
  toJSON<const H extends ToJsonHint<TaskNew>>(hint: H): Promise<JsonPayload<TaskNew, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get newTaskTaskItems(): Collection<TaskNew, TaskItem> {
    return this.__data.relations.newTaskTaskItems ??= hasMany(
      this,
      taskItemMeta,
      "newTaskTaskItems",
      "newTask",
      "new_task_id",
      undefined,
    );
  }

  get selfReferentialTasks(): Collection<TaskNew, TaskNew> {
    return this.__data.relations.selfReferentialTasks ??= hasMany(
      this,
      taskNewMeta,
      "selfReferentialTasks",
      "selfReferential",
      "self_referential_id",
      undefined,
    );
  }

  get copiedTo(): Collection<TaskNew, TaskNew> {
    return this.__data.relations.copiedTo ??= hasMany(
      this,
      taskNewMeta,
      "copiedTo",
      "copiedFrom",
      "copied_from_id",
      undefined,
    );
  }

  get selfReferential(): ManyToOneReference<TaskNew, TaskNew, undefined> {
    return this.__data.relations.selfReferential ??= hasOne(
      this,
      taskNewMeta,
      "selfReferential",
      "selfReferentialTasks",
    );
  }

  get specialNewAuthor(): ManyToOneReference<TaskNew, Author, undefined> {
    return this.__data.relations.specialNewAuthor ??= hasOne(this, authorMeta, "specialNewAuthor", "tasks");
  }

  get copiedFrom(): ManyToOneReference<TaskNew, TaskNew, undefined> {
    return this.__data.relations.copiedFrom ??= hasOne(this, taskNewMeta, "copiedFrom", "copiedTo");
  }

  get copiedFromsRecursive(): ReadOnlyCollection<TaskNew, TaskNew> {
    return this.__data.relations.copiedFromsRecursive ??= hasRecursiveParents(
      this,
      "copiedFromsRecursive",
      "copiedFrom",
      "copiedToRecursive",
    );
  }

  get copiedToRecursive(): ReadOnlyCollection<TaskNew, TaskNew> {
    return this.__data.relations.copiedToRecursive ??= hasRecursiveChildren(
      this,
      "copiedToRecursive",
      "copiedTo",
      "copiedFromsRecursive",
    );
  }

  get taskTaskItems(): Collection<TaskNew, TaskItem> {
    return super.taskTaskItems as Collection<TaskNew, TaskItem>;
  }

  get tags(): Collection<TaskNew, Tag> {
    return super.tags as Collection<TaskNew, Tag>;
  }
}
