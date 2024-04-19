import {
  ConfigApi,
  failNoIdYet,
  getField,
  getInstanceData,
  hasMany,
  hasManyToMany,
  hasOne,
  isLoaded,
  loadLens,
  mustBeSubType,
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
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  JsonHint,
  JsonPayload,
  Lens,
  Loaded,
  LoadHint,
  ManyToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  TaggedId,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import type { Context } from "src/context";
import {
  Comment,
  commentMeta,
  EntityManager,
  newTaskOld,
  Publisher,
  publisherMeta,
  Task,
  TaskItem,
  taskItemMeta,
  TaskOld,
  taskOldMeta,
} from "../entities";
import type {
  CommentId,
  Entity,
  PublisherId,
  TaskFields,
  TaskFilter,
  TaskGraphQLFilter,
  TaskIdsOpts,
  TaskItemId,
  TaskOpts,
  TaskOrder,
} from "../entities";

export type TaskOldId = Flavor<string, TaskOld> & Flavor<string, "Task">;

export interface TaskOldFields extends TaskFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
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

  set(opts: Partial<TaskOldOpts>): void {
    setOpts(this as any as TaskOld, opts);
  }

  setPartial(opts: PartialOrNull<TaskOldOpts>): void {
    setOpts(this as any as TaskOld, opts as OptsOf<TaskOld>, { partial: true });
  }

  get changes(): Changes<TaskOld> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<TaskOld>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskOld, fn, opts);
  }

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

  isLoaded<const H extends LoadHint<TaskOld>>(hint: H): this is Loaded<TaskOld | Task, H> {
    return isLoaded(this as any as TaskOld, hint);
  }

  toJSON(): object;
  toJSON<const H extends JsonHint<TaskOld>>(hint: H): Promise<JsonPayload<TaskOld, H>>;
  toJSON(hint?: any): object {
    return hint ? toJSON(this, hint) : super.toJSON();
  }

  get comments(): Collection<TaskOld, Comment> {
    const { relations } = getInstanceData(this);
    return relations.comments ??= hasMany(
      this as any as TaskOld,
      commentMeta,
      "comments",
      "parent",
      "parent_task_id",
      undefined,
    );
  }

  get oldTaskTaskItems(): Collection<TaskOld, TaskItem> {
    const { relations } = getInstanceData(this);
    return relations.oldTaskTaskItems ??= hasMany(
      this as any as TaskOld,
      taskItemMeta,
      "oldTaskTaskItems",
      "oldTask",
      "old_task_id",
      undefined,
    );
  }

  get tasks(): Collection<TaskOld, TaskOld> {
    const { relations } = getInstanceData(this);
    return relations.tasks ??= hasMany(
      this as any as TaskOld,
      taskOldMeta,
      "tasks",
      "parentOldTask",
      "parent_old_task_id",
      undefined,
    );
  }

  get parentOldTask(): ManyToOneReference<TaskOld, TaskOld, undefined> {
    const { relations } = getInstanceData(this);
    return relations.parentOldTask ??= hasOne(this as any as TaskOld, taskOldMeta, "parentOldTask", "tasks");
  }

  get publishers(): Collection<TaskOld, Publisher> {
    const { relations } = getInstanceData(this);
    return relations.publishers ??= hasManyToMany(
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
