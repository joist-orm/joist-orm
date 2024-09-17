import {
  type Changes,
  type Collection,
  ConfigApi,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FilterOf,
  type Flavor,
  getField,
  type GraphQLFilterOf,
  hasMany,
  hasManyToMany,
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
  newRequiredRule,
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
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import { type Context } from "src/context";
import {
  Comment,
  type CommentId,
  commentMeta,
  type Entity,
  EntityManager,
  newTaskOld,
  Publisher,
  type PublisherId,
  publisherMeta,
  Task,
  type TaskFields,
  type TaskFilter,
  type TaskGraphQLFilter,
  type TaskIdsOpts,
  TaskItem,
  type TaskItemId,
  taskItemMeta,
  TaskOld,
  taskOldMeta,
  type TaskOpts,
  type TaskOrder,
} from "../entities";

export type TaskOldId = Flavor<string, TaskOld> & Flavor<string, "Task">;

export interface TaskOldFields extends TaskFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  specialOldField: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  parentOldTask: { kind: "m2o"; type: TaskOld; nullable: undefined; derived: false };
}

export interface TaskOldOpts extends TaskOpts {
  specialOldField: number;
  parentOldTask?: TaskOld | TaskOldId | null;
  comments?: Comment[];
  oldTaskTaskItems?: TaskItem[];
  tasks?: TaskOld[];
  publishers?: Publisher[];
}

export interface TaskOldIdsOpts extends TaskIdsOpts {
  parentOldTaskId?: TaskOldId | null;
  commentIds?: CommentId[] | null;
  oldTaskTaskItemIds?: TaskItemId[] | null;
  taskIds?: TaskOldId[] | null;
  publisherIds?: PublisherId[] | null;
}

export interface TaskOldFilter extends TaskFilter {
  specialOldField?: ValueFilter<number, never>;
  parentOldTask?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  oldTaskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
  tasks?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null | undefined>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface TaskOldGraphQLFilter extends TaskGraphQLFilter {
  specialOldField?: ValueGraphQLFilter<number>;
  parentOldTask?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  oldTaskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
  tasks?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null | undefined>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
}

export interface TaskOldOrder extends TaskOrder {
  specialOldField?: OrderBy;
  parentOldTask?: TaskOldOrder;
}

export const taskOldConfig = new ConfigApi<TaskOld, Context>();

taskOldConfig.addRule(newRequiredRule("specialOldField"));
taskOldConfig.addRule("parentOldTask", mustBeSubType("parentOldTask"));

export abstract class TaskOldCodegen extends Task implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<TaskOld>;

  declare readonly __orm: {
    entityType: TaskOld;
    filterType: TaskOldFilter;
    gqlFilterType: TaskOldGraphQLFilter;
    orderType: TaskOldOrder;
    optsType: TaskOldOpts;
    fieldsType: TaskOldFields;
    optIdsType: TaskOldIdsOpts;
    factoryOptsType: Parameters<typeof newTaskOld>[1];
  };

  constructor(em: EntityManager, opts: TaskOldOpts) {
    super(em, opts);
    setOpts(this as any as TaskOld, opts, { calledFromConstructor: true });
  }

  get id(): TaskOldId {
    return this.idMaybe || failNoIdYet("TaskOld");
  }

  get idMaybe(): TaskOldId | undefined {
    return toIdOf(taskOldMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("TaskOld");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get specialOldField(): number {
    return getField(this, "specialOldField");
  }

  set specialOldField(specialOldField: number) {
    setField(this, "specialOldField", specialOldField);
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
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  set(opts: Partial<TaskOldOpts>): void {
    setOpts(this as any as TaskOld, opts);
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
   *   firstName: 'foo' // updated
   *   lastName: undefined // do nothing
   *   age: null // unset, (i.e. set it as undefined)
   * });
   * ```
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setPartial(opts: PartialOrNull<TaskOldOpts>): void {
    setOpts(this as any as TaskOld, opts as OptsOf<TaskOld>, { partial: true });
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<TaskOld> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<TaskOld>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskOld, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<TaskOld>>(hint: H): Promise<Loaded<TaskOld, H>>;
  populate<const H extends LoadHint<TaskOld>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<TaskOld, H>>;
  populate<const H extends LoadHint<TaskOld>, V>(hint: H, fn: (task: Loaded<TaskOld, H>) => V): Promise<V>;
  populate<const H extends LoadHint<TaskOld>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (task: Loaded<TaskOld, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<TaskOld>, V>(
    hintOrOpts: any,
    fn?: (task: Loaded<TaskOld, H>) => V,
  ): Promise<Loaded<TaskOld, H> | V> {
    return this.em.populate(this as any as TaskOld, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work. Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<TaskOld>>(hint: H): this is Loaded<TaskOld | Task, H> {
    return isLoaded(this as any as TaskOld, hint);
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
   * @see {@link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<TaskOld>>(hint: H): Promise<JsonPayload<TaskOld, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get comments(): Collection<TaskOld, Comment> {
    return this.__data.relations.comments ??= hasMany(
      this as any as TaskOld,
      commentMeta,
      "comments",
      "parent",
      "parent_task_id",
      undefined,
    );
  }

  get oldTaskTaskItems(): Collection<TaskOld, TaskItem> {
    return this.__data.relations.oldTaskTaskItems ??= hasMany(
      this as any as TaskOld,
      taskItemMeta,
      "oldTaskTaskItems",
      "oldTask",
      "old_task_id",
      undefined,
    );
  }

  get tasks(): Collection<TaskOld, TaskOld> {
    return this.__data.relations.tasks ??= hasMany(
      this as any as TaskOld,
      taskOldMeta,
      "tasks",
      "parentOldTask",
      "parent_old_task_id",
      undefined,
    );
  }

  get parentOldTask(): ManyToOneReference<TaskOld, TaskOld, undefined> {
    return this.__data.relations.parentOldTask ??= hasOne(
      this as any as TaskOld,
      taskOldMeta,
      "parentOldTask",
      "tasks",
    );
  }

  get parentOldTasksRecursive(): ReadOnlyCollection<TaskOld, TaskOld> {
    return this.__data.relations.parentOldTasksRecursive ??= hasRecursiveParents(
      this as any as TaskOld,
      "parentOldTasksRecursive",
      "parentOldTask",
      "tasksRecursive",
    );
  }

  get tasksRecursive(): ReadOnlyCollection<TaskOld, TaskOld> {
    return this.__data.relations.tasksRecursive ??= hasRecursiveChildren(
      this as any as TaskOld,
      "tasksRecursive",
      "tasks",
      "parentOldTasksRecursive",
    );
  }

  get publishers(): Collection<TaskOld, Publisher> {
    return this.__data.relations.publishers ??= hasManyToMany(
      this as any as TaskOld,
      "tasks_to_publishers",
      "publishers",
      "task_id",
      publisherMeta,
      "tasks",
      "publisher_id",
    );
  }
}
