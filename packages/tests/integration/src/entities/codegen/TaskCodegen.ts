import {
  BaseEntity,
  cannotBeUpdated,
  ConfigApi,
  failNoIdYet,
  getField,
  hasMany,
  hasManyToMany,
  isLoaded,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  Changes,
  Collection,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FieldsOf,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  OptsOf,
  OrderBy,
  PartialOrNull,
  RelationsOf,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  EntityManager,
  newTask,
  Tag,
  tagMeta,
  Task,
  TaskItem,
  taskItemMeta,
  taskMeta,
  TaskNew,
  TaskOld,
  TaskType,
  TaskTypeDetails,
  TaskTypes,
} from "../entities";
import type { Entity, TagId, TaskItemId } from "../entities";

export type TaskId = Flavor<string, Task>;

export interface TaskFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  durationInDays: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
  deletedAt: { kind: "primitive"; type: Date; unique: false; nullable: undefined; derived: false };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  type: { kind: "enum"; type: TaskType; nullable: undefined };
}

export interface TaskOpts {
  durationInDays: number;
  deletedAt?: Date | null;
  taskTaskItems?: TaskItem[];
  tags?: Tag[];
}

export interface TaskIdsOpts {
  taskTaskItemIds?: TaskItemId[] | null;
  tagIds?: TagId[] | null;
}

export interface TaskFilter {
  id?: ValueFilter<TaskId, never> | null;
  durationInDays?: ValueFilter<number, never>;
  deletedAt?: ValueFilter<Date, null>;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  type?: ValueFilter<TaskType, null>;
  taskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
  tags?: EntityFilter<Tag, TagId, FilterOf<Tag>, null | undefined>;
}

export interface TaskGraphQLFilter {
  id?: ValueGraphQLFilter<TaskId>;
  durationInDays?: ValueGraphQLFilter<number>;
  deletedAt?: ValueGraphQLFilter<Date>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  type?: ValueGraphQLFilter<TaskType>;
  taskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
  tags?: EntityGraphQLFilter<Tag, TagId, GraphQLFilterOf<Tag>, null | undefined>;
}

export interface TaskOrder {
  id?: OrderBy;
  durationInDays?: OrderBy;
  deletedAt?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  type?: OrderBy;
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

  set(opts: Partial<TaskOpts>): void {
    setOpts(this as any as Task, opts);
  }

  setPartial(opts: PartialOrNull<TaskOpts>): void {
    setOpts(this as any as Task, opts as OptsOf<Task>, { partial: true });
  }

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

  load<U, V>(fn: (lens: Lens<Task>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as Task, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<Task>>(hint: H): this is Loaded<Task, H> {
    return isLoaded(this as any as Task, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<Task>>(hint: H): Promise<JsonPayload<Task, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get taskTaskItems(): Collection<Task, TaskItem> {
    return this.__data.relations.taskTaskItems ??= hasMany(
      this as any as Task,
      taskItemMeta,
      "taskTaskItems",
      "task",
      "task_id",
      undefined,
    );
  }

  get tags(): Collection<Task, Tag> {
    return this.__data.relations.tags ??= hasManyToMany(
      this as any as Task,
      "task_to_tags",
      "tags",
      "task_id",
      tagMeta,
      "tasks",
      "tag_id",
    );
  }
}
