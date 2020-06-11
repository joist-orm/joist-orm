import { Entity } from "../EntityManager";
import { AbstractRelationImpl, AbstractRelationOpts } from "./AbstractRelationImpl";
import { ensureNotDeleted } from "../index";

export class CustomCollection<
  T extends Entity,
  U extends Entity,
  N extends never | undefined
> extends AbstractRelationImpl<U[]> {
  private loaded!: U[] | N;
  private loadPromise: Promise<U[] | N> | undefined;
  public isLoaded = false;
  constructor(private entity: T, private fieldName: keyof T, private opts: AbstractRelationOpts<T, U[], N>) {
    super();
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true ? [...entities] : entities.filter((e) => !e.isDeletedEntity);
  }

  private doGet(opts?: { withDeleted?: boolean }): U[] | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    // This should only be callable in the type system if we've already resolved this to an instance
    if (!this.isLoaded) {
      throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
    }

    return this.filterDeleted(this.loaded as U[], opts);
  }

  get getWithDeleted(): U[] | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U[] | N {
    return this.doGet({ withDeleted: false });
  }

  async load(opts?: { withDeleted?: boolean }): Promise<U[] | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.loadPromise !== undefined) {
      await this.loadPromise;
    }

    if (!this.isLoaded) {
      this.loadPromise = this.opts.load(this.entity);
      this.loaded = await this.loadPromise;
      this.loadPromise = undefined;
      this.isLoaded = true;
    }

    return this.filterDeleted(this.loaded as U[], opts);
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

  async onEntityDeletedAndFlushing(): Promise<void> {
    const { onEntityDeletedAndFlushing } = this.opts;
    if (onEntityDeletedAndFlushing !== undefined) {
      await onEntityDeletedAndFlushing(this.entity);
    }
  }

  onEntityDelete(): void {
    const { onEntityDelete } = this.opts;
    if (onEntityDelete !== undefined) {
      onEntityDelete(this.entity);
    }
  }

  async refreshIfLoaded(): Promise<void> {
    const { refreshIfLoaded } = this.opts;
    if (refreshIfLoaded !== undefined) {
      await refreshIfLoaded(this.entity);
    }
  }

  toString(): string {
    return `CustomCollection(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }
}
