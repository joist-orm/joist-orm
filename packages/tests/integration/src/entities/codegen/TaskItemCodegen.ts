import {
  BaseEntity,
  ConfigApi,
  failNoIdYet,
  getField,
  hasOne,
  isLoaded,
  loadLens,
  mustBeSubType,
  newChangesProxy,
  newRequiredRule,
  setOpts,
  toIdOf,
  toJSON,
} from "joist-orm";
import type {
  Changes,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  EntityManager,
  newTaskItem,
  Task,
  TaskItem,
  taskItemMeta,
  taskMeta,
  TaskNew,
  taskNewMeta,
  TaskOld,
  taskOldMeta,
} from "../entities";
import type { Entity, TaskId, TaskNewId, TaskNewOrder, TaskOldId, TaskOldOrder, TaskOrder } from "../entities";

export type TaskItemId = Flavor<string, TaskItem>;

export interface TaskItemFields {
  id: { kind: "primitive"; type: string; unique: true; nullable: never };
  createdAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  updatedAt: { kind: "primitive"; type: Date; unique: false; nullable: never; derived: true };
  newTask: { kind: "m2o"; type: TaskNew; nullable: undefined; derived: false };
  oldTask: { kind: "m2o"; type: TaskOld; nullable: undefined; derived: false };
  task: { kind: "m2o"; type: Task; nullable: undefined; derived: false };
}

export interface TaskItemOpts {
  newTask?: TaskNew | TaskNewId | null;
  oldTask?: TaskOld | TaskOldId | null;
  task?: Task | TaskId | null;
}

export interface TaskItemIdsOpts {
  newTaskId?: TaskNewId | null;
  oldTaskId?: TaskOldId | null;
  taskId?: TaskId | null;
}

export interface TaskItemFilter {
  id?: ValueFilter<TaskItemId, never> | null;
  createdAt?: ValueFilter<Date, never>;
  updatedAt?: ValueFilter<Date, never>;
  newTask?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null>;
  oldTask?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
  task?: EntityFilter<Task, TaskId, FilterOf<Task>, null>;
  taskTaskNew?: EntityFilter<TaskNew, TaskNewId, FilterOf<TaskNew>, null>;
  taskTaskOld?: EntityFilter<TaskOld, TaskOldId, FilterOf<TaskOld>, null>;
}

export interface TaskItemGraphQLFilter {
  id?: ValueGraphQLFilter<TaskItemId>;
  createdAt?: ValueGraphQLFilter<Date>;
  updatedAt?: ValueGraphQLFilter<Date>;
  newTask?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null>;
  oldTask?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
  task?: EntityGraphQLFilter<Task, TaskId, GraphQLFilterOf<Task>, null>;
  taskTaskNew?: EntityGraphQLFilter<TaskNew, TaskNewId, GraphQLFilterOf<TaskNew>, null>;
  taskTaskOld?: EntityGraphQLFilter<TaskOld, TaskOldId, GraphQLFilterOf<TaskOld>, null>;
}

export interface TaskItemOrder {
  id?: OrderBy;
  createdAt?: OrderBy;
  updatedAt?: OrderBy;
  newTask?: TaskNewOrder;
  oldTask?: TaskOldOrder;
  task?: TaskOrder;
}

export const taskItemConfig = new ConfigApi<TaskItem, Context>();

taskItemConfig.addRule(newRequiredRule("createdAt"));
taskItemConfig.addRule(newRequiredRule("updatedAt"));
taskItemConfig.addRule("newTask", mustBeSubType("newTask"));
taskItemConfig.addRule("oldTask", mustBeSubType("oldTask"));

export abstract class TaskItemCodegen extends BaseEntity<EntityManager, string> implements Entity {
  static readonly tagName = "ti";
  static readonly metadata: EntityMetadata<TaskItem>;

  declare readonly __orm: {
    filterType: TaskItemFilter;
    gqlFilterType: TaskItemGraphQLFilter;
    orderType: TaskItemOrder;
    optsType: TaskItemOpts;
    fieldsType: TaskItemFields;
    optIdsType: TaskItemIdsOpts;
    factoryOptsType: Parameters<typeof newTaskItem>[1];
  };

  constructor(em: EntityManager, opts: TaskItemOpts) {
    super(em, opts);
    setOpts(this as any as TaskItem, opts, { calledFromConstructor: true });
  }

  get id(): TaskItemId {
    return this.idMaybe || failNoIdYet("TaskItem");
  }

  get idMaybe(): TaskItemId | undefined {
    return toIdOf(taskItemMeta, this.idTaggedMaybe);
  }

  get idTagged(): TaggedId {
    return this.idTaggedMaybe || failNoIdYet("TaskItem");
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return getField(this, "id");
  }

  get createdAt(): Date {
    return getField(this, "createdAt");
  }

  get updatedAt(): Date {
    return getField(this, "updatedAt");
  }

  set(opts: Partial<TaskItemOpts>): void {
    setOpts(this as any as TaskItem, opts);
  }

  setPartial(opts: PartialOrNull<TaskItemOpts>): void {
    setOpts(this as any as TaskItem, opts as OptsOf<TaskItem>, { partial: true });
  }

  get changes(): Changes<TaskItem> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<TaskItem>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskItem, fn, opts);
  }

  populate<const H extends LoadHint<TaskItem>>(hint: H): Promise<Loaded<TaskItem, H>>;
  populate<const H extends LoadHint<TaskItem>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<TaskItem, H>>;
  populate<const H extends LoadHint<TaskItem>, V>(hint: H, fn: (ti: Loaded<TaskItem, H>) => V): Promise<V>;
  populate<const H extends LoadHint<TaskItem>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (ti: Loaded<TaskItem, H>) => V,
  ): Promise<V>;
  populate<const H extends LoadHint<TaskItem>, V>(
    hintOrOpts: any,
    fn?: (ti: Loaded<TaskItem, H>) => V,
  ): Promise<Loaded<TaskItem, H> | V> {
    return this.em.populate(this as any as TaskItem, hintOrOpts, fn);
  }

  isLoaded<const H extends LoadHint<TaskItem>>(hint: H): this is Loaded<TaskItem, H> {
    return isLoaded(this as any as TaskItem, hint);
  }

  toJSON(): object;
  toJSON<const H extends ToJsonHint<TaskItem>>(hint: H): Promise<JsonPayload<TaskItem, H>>;
  toJSON(hint?: any): object {
    return !hint || typeof hint === "string" ? super.toJSON() : toJSON(this, hint);
  }

  get newTask(): ManyToOneReference<TaskItem, TaskNew, undefined> {
    return this.__data.relations.newTask ??= hasOne(
      this as any as TaskItem,
      taskNewMeta,
      "newTask",
      "newTaskTaskItems",
    );
  }

  get oldTask(): ManyToOneReference<TaskItem, TaskOld, undefined> {
    return this.__data.relations.oldTask ??= hasOne(
      this as any as TaskItem,
      taskOldMeta,
      "oldTask",
      "oldTaskTaskItems",
    );
  }

  get task(): ManyToOneReference<TaskItem, Task, undefined> {
    return this.__data.relations.task ??= hasOne(this as any as TaskItem, taskMeta, "task", "taskTaskItems");
  }
}
