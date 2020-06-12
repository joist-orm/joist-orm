import { Entity, IdOf, Loaded, LoadHint } from "../EntityManager";
import { AbstractRelationImpl, AbstractRelationOpts } from "./AbstractRelationImpl";
import { Collection, ensureNotDeleted } from "../index";

export type CustomCollectionOpts<
  T extends Entity,
  U extends Entity,
  N extends never | undefined
> = AbstractRelationOpts<T, U[], N> & {
  load: (entity: T) => Promise<Loaded<T, LoadHint<T>>>;
  get: (entity: ReturnType<CustomCollectionOpts<T, U, N>["load"]> extends Promise<infer V> ? V : never) => U[];
  find?: (entity: T, id: IdOf<U>) => Promise<U | undefined>;
  add?: (entity: T, other: U) => void;
  remove?: (entity: T, other: U) => void;
};

export class CustomCollection<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl<U[]>
  implements Collection<T, U> {
  private loadedEntity!: U[] | undefined;
  private loadPromise: ReturnType<CustomCollectionOpts<T, U, N>["load"]> | undefined;
  public isLoaded = false;
  constructor(private entity: T, private fieldName: keyof T, private opts: CustomCollectionOpts<T, U, N>) {
    super();
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true ? [...entities] : entities.filter((e) => !e.isDeletedEntity);
  }

  private doGet(opts?: { withDeleted?: boolean }): U[] | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });

    if (!this.isLoaded && !this.entity.isNewEntity) {
      // This should only be callable in the type system if we've already resolved this to an instance
      throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
    }

    const entities = this.entity.isNewEntity ? this.opts.get(this.entity as any) : this.loaded;
    return this.filterDeleted(entities as U[], opts);
  }

  get getWithDeleted(): U[] | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U[] | N {
    return this.doGet({ withDeleted: false });
  }

  async load(opts?: { withDeleted?: boolean }): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loadPromise !== undefined) {
      await this.loadPromise;
    }

    if (!this.isLoaded) {
      this.loadPromise = this.opts.load(this.entity);
      const loadedEnitity = await this.loadPromise;
      this.loaded = this.opts.get(loadedEnitity);
      this.loadPromise = undefined;
      this.isLoaded = true;
    }

    return this.filterDeleted(this.loaded!, opts);
  }

  initializeForNewEntity(): void {
    this.isLoaded = true;
  }

  set(values: U[]): void {
    const { set } = this.opts;
    if (set === undefined) {
      throw new Error(`'set' not implemented on ${this}`);
    }
    set(this.entity, values);
  }

  setFromOpts(values: U[]): void {
    const { setFromOpts, set } = this.opts;
    if (setFromOpts !== undefined) {
      setFromOpts(this.entity, values);
    } else if (set !== undefined) {
      set(this.entity, values);
    } else {
      throw new Error(`'setFromOpts' not implemented on ${this}`);
    }
  }

  async onEntityDeletedAndFlushing(): Promise<void> {}

  onEntityDelete(): void {}

  async refreshIfLoaded(): Promise<void> {}

  async find(id: IdOf<U>): Promise<U | undefined> {
    const { find } = this.opts;
    return find !== undefined ? await find(this.entity, id) : undefined;
  }

  add(other: U): void {
    const { add } = this.opts;
    if (add === undefined) {
      throw new Error(`'add' not implemented on ${this}`);
    }
    add(this.entity, other);
  }

  remove(other: U): void {
    const { remove } = this.opts;
    if (remove === undefined) {
      throw new Error(`'remove' not implemented on ${this}`);
    }
    remove(this.entity, other);
  }

  toString(): string {
    return `CustomCollection(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }
}
