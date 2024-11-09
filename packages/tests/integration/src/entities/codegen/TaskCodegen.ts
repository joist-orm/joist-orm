import {
  BaseEntity,
  cannotBeUpdated,
  type Changes,
  cleanStringValue,
  type Collection,
  ConfigApi,
  type DeepPartialOrNull,
  type EntityFilter,
  type EntityGraphQLFilter,
  type EntityMetadata,
  failNoIdYet,
  type FieldsOf,
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
  newChangesProxy,
  newRequiredRule,
  type OptsOf,
  type OrderBy,
  type PartialOrNull,
  type ReactiveField,
  type ReadOnlyCollection,
  type RelationsOf,
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
import { type Context } from "src/context";
import {
  type Entity,
  EntityManager,
  newTask,
  Tag,
  type TagId,
  tagMeta,
  Task,
  TaskItem,
  type TaskItemId,
  taskItemMeta,
  taskMeta,
  TaskNew,
  type TaskNewId,
  TaskOld,
  type TaskOldId,
  TaskType,
  TaskTypeDetails,
  TaskTypes,
} from "../entities";

export type TaskId = Flavor<string, "Task">;

export interface TaskFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  durationInDays: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  syncDefault: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  asyncDefault_1: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  asyncDefault_2: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: false };
  syncDerived: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  asyncDerived: { kind: "primitive"; type: string; unique: false; nullable: undefined; derived: true };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  type: { kind: "enum"; type: TaskType; nullable: undefined };
  copiedFrom: { kind: "m2o"; type: Task; nullable: undefined; derived: false };
}

export interface TaskOpts {
  durationInDays?: number;
  deletedAt?: Date | null;
  syncDefault?: string | null;
  asyncDefault_1?: string | null;
  asyncDefault_2?: string | null;
  copiedFrom?: Task | TaskId | null;
  copiedTo?: Task[];
  taskTaskItems?: TaskItem[];
  tags?: Tag[];
}

export interface TaskIdsOpts {
  copiedFromId?: TaskId | null;
  copiedToIds?: TaskId[] | null;
  taskTaskItemIds?: TaskItemId[] | null;
  tagIds?: TagId[] | null;
}

export interface TaskFilter {
  id?: ValueFilter<TaskId, never> | null;
  durationInDays?: ValueFilter<number, never>;
  deletedAt?: ValueFilter<Date, null>;
  syncDefault?: ValueFilter<string, null>;
  asyncDefault_1?: ValueFilter<string, null>;
  asyncDefault_2?: ValueFilter<string, null>;
  syncDerived?: ValueFilter<string, null>;
  asyncDerived?: ValueFilter<string, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  type?: ValueFilter<TaskType, null>;
  copiedFrom?: EntityFilter<Task, TaskId, FilterOf<Task>, null>;
  copiedFromTaskNew?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null>;
  copiedFromTaskOld?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
  copiedTo?: EntityFilter<Task, TaskId, FilterOf<Task>, null | undefined>;
  copiedToTaskNew?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null>;
  copiedToTaskOld?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
  taskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
}

export interface TaskGraphQLFilter {
  id?: ValueGraphQLFilter<TaskId>;
  durationInDays?: ValueGraphQLFilter<number>;
  deletedAt?: ValueGraphQLFilter<Date>;
  syncDefault?: ValueGraphQLFilter<string>;
  asyncDefault_1?: ValueGraphQLFilter<string>;
  asyncDefault_2?: ValueGraphQLFilter<string>;
  syncDerived?: ValueGraphQLFilter<string>;
  asyncDerived?: ValueGraphQLFilter<string>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  type?: ValueGraphQLFilter<TaskType>;
  copiedFrom?: EntityGraphQLFilter<Task, TaskId, GraphQLFilterOf<Task>, null>;
  copiedFromTaskNew?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null>;
  copiedFromTaskOld?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
  copiedTo?: EntityGraphQLFilter<Task, TaskId, GraphQLFilterOf<Task>, null | undefined>;
  copiedToTaskNew?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null>;
  copiedToTaskOld?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
  taskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
}

export interface TaskOrder {
  id?: OrderBy;
  durationInDays?: OrderBy;
  deletedAt?: OrderBy;
  syncDefault?: OrderBy;
  asyncDefault_1?: OrderBy;
  asyncDefault_2?: OrderBy;
  syncDerived?: OrderBy;
  asyncDerived?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  type?: OrderBy;
  copiedFrom?: TaskOrder;
}

export const taskConfig = new ConfigApi<Task, Context>();

taskConfig.addRule(newRequiredRule("durationInDays"));
taskConfig.addRule(newRequiredRule("createdAt"));
taskConfig.addRule(newRequiredRule("updatedAt"));
taskConfig.addRule(cannotBeUpdated("type"));

export abstract class TaskCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<Task>;

  declare readonly __orm: {
    entityType: Task;
    filterType: TaskFilter;
    gqlFilterType: TaskGraphQLFilter;
    orderType: TaskOrder;
    optsType: TaskOpts;
    fieldsType: TaskFields;
    optIdsType: TaskIdsOpts;
    factoryOptsType: Parameters<typeof newTask>[1];
  };

  constructor(em: EntityManager, opts: TaskOpts) {
    super(em, opts);
    setOpts(this as any as Task, opts, { calledFromConstructor: true });
  }

  get id(): TaskId {
    return this.idMaybe || failNoIdYet("Task");
  }

  get idMaybe(): TaskId | undefined {
    return toIdOf(taskMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("Task");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get durationInDays(): number {
    return getField(this, "durationInDays");
  }

  set durationInDays(durationInDays: number) {
    setField(this, "durationInDays", durationInDays);
  }

  get deletedAt(): Date | undefined {
    return getField(this, "deletedAt");
  }

  set deletedAt(deletedAt: Date | undefined) {
    setField(this, "deletedAt", deletedAt);
  }

  get syncDefault(): string | undefined {
    return getField(this, "syncDefault");
  }

  set syncDefault(syncDefault: string | undefined) {
    setField(this, "syncDefault", cleanStringValue(syncDefault));
  }

  get asyncDefault_1(): string | undefined {
    return getField(this, "asyncDefault_1");
  }

  set asyncDefault_1(asyncDefault_1: string | undefined) {
    setField(this, "asyncDefault_1", cleanStringValue(asyncDefault_1));
  }

  get asyncDefault_2(): string | undefined {
    return getField(this, "asyncDefault_2");
  }

  set asyncDefault_2(asyncDefault_2: string | undefined) {
    setField(this, "asyncDefault_2", cleanStringValue(asyncDefault_2));
  }

  abstract get syncDerived(): string | undefined;

  abstract readonly asyncDerived: ReactiveField<Task, string | undefined>;

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  get type(): TaskType | undefined {
    return getField(this, "type");
  }

  get typeDetails(): TaskTypeDetails | undefined {
    return this.type ? TaskTypes.getByCode(this.type) : undefined;
  }

  set type(type: TaskType | undefined) {
    setField(this, "type", type);
  }

  get isOld(): boolean {
    return getField(this, "type") === TaskType.Old;
  }

  get isNew(): boolean {
    return getField(this, "type") === TaskType.New;
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
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
  set(opts: Partial<TaskOpts>): void {
    setOpts(this as any as Task, opts);
  }

  /**
   * Partial update taking any subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
   *
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
  setPartial(opts: PartialOrNull<TaskOpts>): void {
    setOpts(this as any as Task, opts as OptsOf<Task>, { partial: true });
  }

  /**
   * Partial update taking any nested subset of the entities fields.
   *
   * Unlike `set`, null is used as a marker to mean "unset this field", and undefined
   * is left as untouched.
   *
   * Collections are exhaustively set to the new values, however,
   * {@link https://joist-orm.io/docs/features/partial-update-apis#incremental-collection-updates | Incremental collection updates} are supported.
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
   * @see {@link https://joist-orm.io/docs/features/partial-update-apis | Partial Update APIs} on the Joist docs
   */
  setDeepPartial(opts: DeepPartialOrNull<Task>): Promise<void> {
    return updatePartial(this as any as Task, opts);
  }

  /**
   * Details the field changes of the entity within the current unit of work.
   *
   * @see {@link https://joist-orm.io/docs/features/changed-fields | Changed Fields} on the Joist docs
   */
  get changes(): Changes<
    Task,
    | keyof (FieldsOf<Task> & RelationsOf<Task>)
    | keyof (FieldsOf<TaskNew> & RelationsOf<TaskNew>)
    | keyof (FieldsOf<TaskOld> & RelationsOf<TaskOld>)
  > {
    return newChangesProxy(this) as any;
  }

  get isSoftDeletedEntity(): boolean {
    return this.deletedAt !== undefined;
  }

  /**
   * Traverse from this entity using a lens, and load the result.
   *
   * @see {@link https://joist-orm.io/docs/advanced/lenses | Lens Traversal} on the Joist docs
   */
  load<U, V>(fn: (lens: Lens<Task>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Task, fn, opts);
  }

  /**
   * Hydrate this entity using a load hint
   *
   * @see {@link https://joist-orm.io/docs/features/loading-entities#1-object-graph-navigation | Loading entities} on the Joist docs
   */
  populate<const H extends LoadHint<Task>>(hint: H): Promise<Loaded<Task, H>>;
  populate<const H extends LoadHint<Task>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<Task, H>>;
  populate<const H extends LoadHint<Task>, V>(hint: H, fn: (task: Loaded<Task, H>) => V): Promise<V>;
  populate<const H extends LoadHint<Task>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (task: Loaded<Task, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<Task>, V>(
    hintOrOpts: any,
    fn?: (task: Loaded<Task, H>) => V,
  ): Promise<Loaded<Task, H> | V> {
    return this.em.populate(this as any as Task, hintOrOpts, fn);
  }

  /**
   * Given a load hint, checks if it is loaded within the unit of work.
   *
   * Type Guarded via Loaded<>
   */
  isLoaded<const H extends LoadHint<Task>>(hint: H): this is Loaded<Task, H> {
    return isLoaded(this as any as Task, hint);
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
   * @see {@link https://joist-orm.io/docs/advanced/json-payloads | Json Payloads} on the Joist docs
   */
  toJSON(): object;
  toJSON<const H extends ToJsonHint<Task>>(hint: H): Promise<JsonPayload<Task, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get copiedTo(): Collection<Task, Task> {
    return this.__data.relations.copiedTo ??= hasMany(
      this,
      taskMeta,
      "copiedTo",
      "copiedFrom",
      "copied_from_id",
      undefined,
    );
  }

  get taskTaskItems(): Collection<Task, TaskItem> {
    return this.__data.relations.taskTaskItems ??= hasMany(
      this,
      taskItemMeta,
      "taskTaskItems",
      "task",
      "task_id",
      undefined,
    );
  }

  get copiedFrom(): ManyToOneReference<Task, Task, undefined> {
    return this.__data.relations.copiedFrom ??= hasOne(this, taskMeta, "copiedFrom", "copiedTo");
  }

  get copiedFromsRecursive(): ReadOnlyCollection<Task, Task> {
    return this.__data.relations.copiedFromsRecursive ??= hasRecursiveParents(
      this,
      "copiedFromsRecursive",
      "copiedFrom",
      "copiedToRecursive",
    );
  }

  get copiedToRecursive(): ReadOnlyCollection<Task, Task> {
    return this.__data.relations.copiedToRecursive ??= hasRecursiveChildren(
      this,
      "copiedToRecursive",
      "copiedTo",
      "copiedFromsRecursive",
    );
  }

  get tags(): Collection<Task, Tag> {
    return this.__data.relations.tags ??= hasManyToMany(
      this,
      "task_to_tags",
      "tags",
      "task_id",
      tagMeta,
      "tasks",
      "tag_id",
    );
  }
}
