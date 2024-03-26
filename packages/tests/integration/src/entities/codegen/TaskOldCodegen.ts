import {
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  FilterOf,
  Flavor,
  getField,
  getOrmField,
  GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  setField,
  setOpts,
  TaggedId,
  toIdOf,
  ValueFilter,
  ValueGraphQLFilter,
} from "joist-orm";
import { Context } from "src/context";
import {
  Comment,
  CommentId,
  commentMeta,
  Entity,
  EntityManager,
  newTaskOld,
  Publisher,
  PublisherId,
  publisherMeta,
  Task,
  TaskFields,
  TaskFilter,
  TaskGraphQLFilter,
  TaskIdsOpts,
  TaskItem,
  TaskItemId,
  taskItemMeta,
  TaskOld,
  taskOldMeta,
  TaskOpts,
  TaskOrder,
} from "../entities";

export type TaskOldId = Flavor<string, TaskOld> & Flavor<string, "Task">;

export interface TaskOldFields extends TaskFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  specialOldField: { kind: "primitive"; type: number; unique: false; nullable: never; derived: false };
}

export interface TaskOldOpts extends TaskOpts {
  specialOldField: number;
  comments?: Comment[];
  oldTaskTaskItems?: TaskItem[];
  publishers?: Publisher[];
}

export interface TaskOldIdsOpts extends TaskIdsOpts {
  commentIds?: CommentId[] | null;
  oldTaskTaskItemIds?: TaskItemId[] | null;
  publisherIds?: PublisherId[] | null;
}

export interface TaskOldFilter extends TaskFilter {
  specialOldField?: ValueFilter<number, never>;
  comments?: EntityFilter<Comment, CommentId, FilterOf<Comment>, null | undefined>;
  oldTaskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
  publishers?: EntityFilter<Publisher, PublisherId, FilterOf<Publisher>, null | undefined>;
}

export interface TaskOldGraphQLFilter extends TaskGraphQLFilter {
  specialOldField?: ValueGraphQLFilter<number>;
  comments?: EntityGraphQLFilter<Comment, CommentId, GraphQLFilterOf<Comment>, null | undefined>;
  oldTaskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
  publishers?: EntityGraphQLFilter<Publisher, PublisherId, GraphQLFilterOf<Publisher>, null | undefined>;
}

export interface TaskOldOrder extends TaskOrder {
  specialOldField?: OrderBy;
}

export const taskOldConfig = new ConfigApi<TaskOld, Context>();

taskOldConfig.addRule(newRequiredRule("specialOldField"));

export abstract class TaskOldCodegen extends Task implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<TaskOld>;

  declare readonly __orm: EntityOrmField & {
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

  populate<H extends LoadHint<TaskOld>>(hint: H): Promise<Loaded<TaskOld, H>>;
  populate<H extends LoadHint<TaskOld>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<TaskOld, H>>;
  populate<H extends LoadHint<TaskOld>, V>(hint: H, fn: (task: Loaded<TaskOld, H>) => V): Promise<V>;
  populate<H extends LoadHint<TaskOld>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (task: Loaded<TaskOld, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<TaskOld>, V>(
    hintOrOpts: any,
    fn?: (task: Loaded<TaskOld, H>) => V,
  ): Promise<Loaded<TaskOld, H> | V> {
    return this.em.populate(this as any as TaskOld, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<TaskOld>>(hint: H): this is Loaded<TaskOld | Task, H> {
    return isLoaded(this as any as TaskOld, hint);
  }

  get comments(): Collection<TaskOld, Comment> {
    const { relations } = getOrmField(this);
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
    const { relations } = getOrmField(this);
    return relations.oldTaskTaskItems ??= hasMany(
      this as any as TaskOld,
      taskItemMeta,
      "oldTaskTaskItems",
      "oldTask",
      "old_task_id",
      undefined,
    );
  }

  get publishers(): Collection<TaskOld, Publisher> {
    const { relations } = getOrmField(this);
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
