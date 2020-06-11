import { Entity, IdOf } from "../EntityManager";
import { AbstractRelationImpl, AbstractRelationOpts } from "./AbstractRelationImpl";
import { ensureNotDeleted, fail, Reference } from "../index";

export type CustomReferenceOpts<T extends Entity, U, N extends never | undefined> = AbstractRelationOpts<T, U, N> & {
  load: (entity: T) => Promise<U | N>;
  isSet?: (entity: T) => boolean;
  id?: (entity: T) => IdOf<U> | undefined;
  idOrFail?: (entity: T) => IdOf<U>;
};

export class CustomReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl<U>
  implements Reference<T, U, N> {
  private loaded!: U | N;
  private loadPromise: Promise<U | N> | undefined;
  public isLoaded = false;
  constructor(private entity: T, private fieldName: keyof T, private opts: CustomReferenceOpts<T, U, N>) {
    super();
  }

  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : (undefined as N);
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    // This should only be callable in the type system if we've already resolved this to an instance
    if (!this.isLoaded) {
      throw new Error(`${this.entity}.${this.fieldName} was not loaded`);
    }

    return this.filterDeleted(this.loaded, opts);
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  async load(opts?: { withDeleted?: boolean }): Promise<U | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (this.isLoaded) {
      return this.loaded;
    }

    if (this.loadPromise !== undefined) {
      return this.loadPromise;
    }

    this.loadPromise = this.opts.load(this.entity);

    this.loaded = await this.loadPromise;

    this.loadPromise = undefined;
    this.isLoaded = true;

    return this.filterDeleted(this.loaded, opts);
  }

  initializeForNewEntity(): void {
    this.isLoaded = true;
  }

  get id(): IdOf<U> | undefined {
    const { id } = this.opts;
    if (id !== undefined) {
      return id(this.entity);
    } else if (this.isLoaded) {
      return this.loaded?.id as IdOf<U> | undefined;
    } else {
      return undefined;
    }
  }

  get idOrFail(): IdOf<U> {
    const { idOrFail } = this.opts;
    const id = idOrFail !== undefined ? idOrFail(this.entity) : this.id;
    return id || fail("CustomReference.id is unset, assigned to a new entity, or missing an implementation");
  }

  isSet(): boolean {
    const { isSet } = this.opts;
    if (isSet === undefined) {
      throw new Error(`'set' not implemented on ${this}`);
    }
    return isSet(this.entity);
  }

  set(value: U): void {
    const { set } = this.opts;
    if (set === undefined) {
      throw new Error(`'set' not implemented on ${this}`);
    }
    set(this.entity, value);
  }

  setFromOpts(value: U): void {
    const { setFromOpts, set } = this.opts;
    if (setFromOpts !== undefined) {
      setFromOpts(this.entity, value);
    } else if (set !== undefined) {
      set(this.entity, value);
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
    return `CustomReference(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }
}
