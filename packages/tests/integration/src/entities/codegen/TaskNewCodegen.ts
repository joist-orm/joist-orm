import {
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  failNoIdYet,
  FilterOf,
  Flavor,
  getField,
  getInstanceData,
  GraphQLFilterOf,
  hasMany,
  hasOne,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  newChangesProxy,
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
  Author,
  AuthorId,
  authorMeta,
  AuthorOrder,
  Entity,
  EntityManager,
  newTaskNew,
  Task,
  TaskFields,
  TaskFilter,
  TaskGraphQLFilter,
  TaskIdsOpts,
  TaskItem,
  TaskItemId,
  taskItemMeta,
  TaskNew,
  taskNewMeta,
  TaskOpts,
  TaskOrder,
} from "../entities";

export type TaskNewId = Flavor<string, TaskNew> & Flavor<string, "Task">;

export interface TaskNewFields extends TaskFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  specialNewField: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
  specialNewAuthor: { kind: "m2o"; type: Author; nullable: undefined; derived: false };
}

export interface TaskNewOpts extends TaskOpts {
  specialNewField?: number | null;
  specialNewAuthor?: Author | AuthorId | null;
  newTaskTaskItems?: TaskItem[];
}

export interface TaskNewIdsOpts extends TaskIdsOpts {
  specialNewAuthorId?: AuthorId | null;
  newTaskTaskItemIds?: TaskItemId[] | null;
}

export interface TaskNewFilter extends TaskFilter {
  specialNewField?: ValueFilter<number, null>;
  specialNewAuthor?: EntityFilter<Author, AuthorId, FilterOf<Author>, null>;
  newTaskTaskItems?: EntityFilter<TaskItem, TaskItemId, FilterOf<TaskItem>, null | undefined>;
}

export interface TaskNewGraphQLFilter extends TaskGraphQLFilter {
  specialNewField?: ValueGraphQLFilter<number>;
  specialNewAuthor?: EntityGraphQLFilter<Author, AuthorId, GraphQLFilterOf<Author>, null>;
  newTaskTaskItems?: EntityGraphQLFilter<TaskItem, TaskItemId, GraphQLFilterOf<TaskItem>, null | undefined>;
}

export interface TaskNewOrder extends TaskOrder {
  specialNewField?: OrderBy;
  specialNewAuthor?: AuthorOrder;
}

export const taskNewConfig = new ConfigApi<TaskNew, Context>();

export abstract class TaskNewCodegen extends Task implements Entity {
  static readonly tagName = "task";
  static readonly metadata: EntityMetadata<TaskNew>;

  declare readonly __orm: {
    filterType: TaskNewFilter;
    gqlFilterType: TaskNewGraphQLFilter;
    orderType: TaskNewOrder;
    optsType: TaskNewOpts;
    fieldsType: TaskNewFields;
    optIdsType: TaskNewIdsOpts;
    factoryOptsType: Parameters<typeof newTaskNew>[1];
  };

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

  set(opts: Partial<TaskNewOpts>): void {
    setOpts(this as any as TaskNew, opts);
  }

  setPartial(opts: PartialOrNull<TaskNewOpts>): void {
    setOpts(this as any as TaskNew, opts as OptsOf<TaskNew>, { partial: true });
  }

  get changes(): Changes<TaskNew> {
    return newChangesProxy(this) as any;
  }

  load<U, V>(fn: (lens: Lens<TaskNew>) => Lens<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
    return loadLens(this as any as TaskNew, fn, opts);
  }

  populate<H extends LoadHint<TaskNew>>(hint: H): Promise<Loaded<TaskNew, H>>;
  populate<H extends LoadHint<TaskNew>>(opts: { hint: H; forceReload?: boolean }): Promise<Loaded<TaskNew, H>>;
  populate<H extends LoadHint<TaskNew>, V>(hint: H, fn: (task: Loaded<TaskNew, H>) => V): Promise<V>;
  populate<H extends LoadHint<TaskNew>, V>(
    opts: { hint: H; forceReload?: boolean },
    fn: (task: Loaded<TaskNew, H>) => V,
  ): Promise<V>;
  populate<H extends LoadHint<TaskNew>, V>(
    hintOrOpts: any,
    fn?: (task: Loaded<TaskNew, H>) => V,
  ): Promise<Loaded<TaskNew, H> | V> {
    return this.em.populate(this as any as TaskNew, hintOrOpts, fn);
  }

  isLoaded<H extends LoadHint<TaskNew>>(hint: H): this is Loaded<TaskNew | Task, H> {
    return isLoaded(this as any as TaskNew, hint);
  }

  get newTaskTaskItems(): Collection<TaskNew, TaskItem> {
    const { relations } = getInstanceData(this);
    return relations.newTaskTaskItems ??= hasMany(
      this as any as TaskNew,
      taskItemMeta,
      "newTaskTaskItems",
      "newTask",
      "new_task_id",
      undefined,
    );
  }

  get specialNewAuthor(): ManyToOneReference<TaskNew, Author, undefined> {
    const { relations } = getInstanceData(this);
    return relations.specialNewAuthor ??= hasOne(this as any as TaskNew, authorMeta, "specialNewAuthor", "tasks");
  }
}