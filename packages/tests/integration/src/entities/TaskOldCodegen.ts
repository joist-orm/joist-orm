import {
  Changes,
  ConfigApi,
  EntityMetadata,
  EntityOrmField,
  failNoIdYet,
  Flavor,
  getField,
  isLoaded,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
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
  Entity,
  EntityManager,
  newTaskOld,
  Task,
  TaskFields,
  TaskFilter,
  TaskGraphQLFilter,
  TaskIdsOpts,
  TaskOld,
  taskOldMeta,
  TaskOpts,
  TaskOrder,
} from "./entities";

export type TaskOldId = Flavor<string, TaskOld> & Flavor<string, "Task">;

export interface TaskOldFields extends TaskFields {
  id: { kind: "primitive"; type: number; unique: true; nullable: never };
  specialOldField: { kind: "primitive"; type: number; unique: false; nullable: undefined; derived: false };
}

export interface TaskOldOpts extends TaskOpts {
  specialOldField?: number | null;
}

export interface TaskOldIdsOpts extends TaskIdsOpts {
}

export interface TaskOldFilter extends TaskFilter {
  specialOldField?: ValueFilter<number, null>;
}

export interface TaskOldGraphQLFilter extends TaskGraphQLFilter {
  specialOldField?: ValueGraphQLFilter<number>;
}

export interface TaskOldOrder extends TaskOrder {
  specialOldField?: OrderBy;
}

export const taskOldConfig = new ConfigApi<TaskOld, Context>();

export abstract class TaskOldCodegen extends Task implements Entity {
  static defaultValues: object = {};
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
    // @ts-ignore
    super(em, taskOldMeta, TaskOldCodegen.defaultValues, opts);
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

  get specialOldField(): number | undefined {
    return getField(this, "specialOldField");
  }

  set specialOldField(specialOldField: number | undefined) {
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
}
