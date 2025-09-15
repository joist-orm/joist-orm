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
  updatePartial,
  type ValueFilter,
  type ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Comment,
  type CommentId,
  type Entity,
  newTaskOld,
  Publisher,
  type PublisherId,
  Tag,
  Task,
  type TaskFields,
  type TaskFilter,
  type TaskGraphQLFilter,
  type TaskIdsOpts,
  TaskItem,
  type TaskItemId,
  TaskOld,
  taskOldMeta,
  type TaskOpts,
  type TaskOrder,
} from "../entities";

export type TaskOldId = Flavor<string, "Task">;

export interface TaskOldFields extends TaskFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  specialOldField: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  parentOldTask: { kind: "m2o"; type: TaskOld; nullable: undefined; derived: false };
  copiedFrom: { kind: "m2o"; type: TaskOld; nullable: undefined; derived: false };
  publishers: { kind: "m2m"; type: Publisher };
  comments: { kind: "o2m"; type: Comment };
  oldTaskTaskItems: { kind: "o2m"; type: TaskItem };
  tasks: { kind: "o2m"; type: TaskOld };
  copiedTo: { kind: "o2m"; type: TaskOld };
}

export interface TaskOldOpts extends TaskOpts {
  specialOldField: number;
  parentOldTask?: TaskOld | TaskOldId | null;
  comments?: Comment[];
  oldTaskTaskItems?: TaskItem[];
  tasks?: TaskOld[];
  copiedTo?: TaskOld[];
  publishers?: Publisher[];
}

export interface TaskOldIdsOpts extends TaskIdsOpts {
  parentOldTaskId?: TaskOldId | null;
  copiedFromId?: TaskOldId | null;
  commentIds?: CommentId[] | null;
  oldTaskTaskItemIds?: TaskItemId[] | null;
  taskIds?: TaskOldId[] | null;
  copiedToIds?: TaskOldId[] | null;
  publisherIds?: PublisherId[] | null;
}

export interface TaskOldFilter extends TaskFilter {
  specialOldField?: ValueFilter<number, never>;
  parentOldTask?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
  copiedFrom?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  oldTaskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
  tasks?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null | undefined>;
  copiedTo?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null | undefined>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface TaskOldGraphQLFilter extends TaskGraphQLFilter {
  specialOldField?: ValueGraphQLFilter<number>;
  parentOldTask?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
  copiedFrom?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  oldTaskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
  tasks?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null | undefined>;
  copiedTo?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null | undefined>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
}

export interface TaskOldOrder extends TaskOrder {
  specialOldField?: OrderBy;
  parentOldTask?: TaskOldOrder;
  copiedFrom?: TaskOldOrder;
}

export interface TaskOldFactoryExtras {
}

export const taskOldConfig = new ConfigApi<TaskOld, Context>();

taskOldConfig.addRule(newRequiredRule("specialOldField"));
taskOldConfig.addRule("parentOldTask", mustBeSubType("parentOldTask"));
taskOldConfig.addRule("copiedFrom", mustBeSubType("copiedFrom"));
taskOldConfig.addRule("copiedFrom", mustBeSubType("copiedFrom"));

declare module "joist-orm" {
  interface TypeMap {
    TaskOld: {
      entityType: TaskOld;
      filterType: TaskOldFilter;
      gqlFilterType: TaskOldGraphQLFilter;
      orderType: TaskOldOrder;
      optsType: TaskOldOpts;
      fieldsType: TaskOldFields;
      optIdsType: TaskOldIdsOpts;
      factoryExtrasType: TaskOldFactoryExtras;
      factoryOptsType: Parameters<typeof newTaskOld>[1];
    };
  }
}

export abstract class TaskOldCodegen extends Task implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<TaskOld>;

  declare readonly __type: { 0: "Task"; 1: "TaskOld" };

  readonly comments: Collection<TaskOld, Comment> = hasMany("parent", "parent_task_id", undefined);
  readonly oldTaskTaskItems: Collection<TaskOld, TaskItem> = hasMany("oldTask", "old_task_id", undefined);
  readonly tasks: Collection<TaskOld, TaskOld> = hasMany("parentOldTask", "parent_old_task_id", undefined);
  readonly copiedTo: Collection<TaskOld, TaskOld> = hasMany("copiedFrom", "copied_from_id", undefined);
  readonly parentOldTask: ManyToOneReference<TaskOld, TaskOld, undefined> = hasOne("tasks");
  readonly copiedFrom: ManyToOneReference<TaskOld, TaskOld, undefined> = hasOne("copiedTo");
  readonly parentOldTasksRecursive: ReadOnlyCollection<TaskOld, TaskOld> = hasRecursiveParents(
    "parentOldTask",
    "tasksRecursive",
  );
  readonly tasksRecursive: ReadOnlyCollection<TaskOld, TaskOld> = hasRecursiveChildren(
    "tasks",
    "parentOldTasksRecursive",
  );
  readonly copiedFromsRecursive: ReadOnlyCollection<TaskOld, TaskOld> = hasRecursiveParents(
    "copiedFrom",
    "copiedToRecursive",
  );
  readonly copiedToRecursive: ReadOnlyCollection<TaskOld, TaskOld> = hasRecursiveChildren(
    "copiedTo",
    "copiedFromsRecursive",
  );
  readonly publishers: Collection<TaskOld, Publisher> = hasManyToMany(
    "tasks_to_publishers",
    "task_id",
    "tasks",
    "publisher_id",
  );
  declare readonly taskTaskItems: Collection<TaskOld, TaskItem>;
  declare readonly tags: Collection<TaskOld, Tag>;

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
  set(opts: Partial<TaskOldOpts>): void {
    setOpts(this as any as TaskOld, opts);
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
  setPartial(opts: PartialOrNull<TaskOldOpts>): void {
    setOpts(this as any as TaskOld, opts as OptsOf<TaskOld>, { partial: true });
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
  setDeepPartial(opts: DeepPartialOrNull<TaskOld>): Promise<void> {
    return updatePartial(this as any as TaskOld, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<TaskOld> {
    return newChangesProxy(this) as any;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<TaskOld>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskOld, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
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
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<TaskOld>>(hint: H): this is Loaded<TaskOld | Task, H> {
    return isLoaded(this as any as TaskOld, hint);
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
  toJSON<const H extends ToJsonHint<TaskOld>>(hint: H): Promise<JsonPayload<TaskOld, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }
}
