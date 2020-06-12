import { Entity, IdOf, LoadHint, Loaded } from "../EntityManager";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ensureNotDeleted, fail, Reference } from "../index";

export type CustomReferenceOpts<
  T extends Entity,
  U extends Entity,
  H extends LoadHint<T>,
  N extends never | undefined
> = {
  load: (entity: T) => Promise<void>;
  get: (entity: Loaded<T, H>) => U | N;
  set?: (entity: Loaded<T, H>, other: U) => void;
  isSet?: (entity: Loaded<T, H>) => boolean;
};

export class CustomReference<T extends Entity, U extends Entity, H extends LoadHint<T>, N extends never | undefined>
  extends AbstractRelationImpl<U>
  implements Reference<T, U, N> {
  private loadPromise: Promise<void> | undefined;
  private _isLoaded = false;
  constructor(public entity: T, public fieldName: keyof T, private opts: CustomReferenceOpts<T, U, H, N>) {
    super();
  }

  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : (undefined as N);
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    ensureNewOrLoaded(this);

    return this.filterDeleted(this.opts.get(this.entity as any), opts);
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  async load(opts?: { withDeleted?: boolean }): Promise<U | N> {
    ensureNotDeleted(this.entity, { ignore: "pending" });
    if (!this.isLoaded) {
      if (this.loadPromise === undefined) {
        this.loadPromise = this.opts.load(this.entity);
        await this.loadPromise;
        this.loadPromise = undefined;
        this._isLoaded = true;
      } else {
        await this.loadPromise;
      }
    }

    return this.doGet(opts);
  }

  initializeForNewEntity(): void {
    this._isLoaded = true;
  }

  get id(): IdOf<U> | undefined {
    return fail(`CustomReference cannot resolve 'id'`);
  }

  get idOrFail(): IdOf<U> {
    return fail(`CustomReference cannot resolve 'idOrFail'`);
  }

  isSet(): boolean {
    ensureNewOrLoaded(this);

    const { isSet } = this.opts;
    if (isSet === undefined) {
      throw new Error(`'isSet' not implemented on ${this}`);
    }
    return isSet(this.entity as any);
  }

  set(value: U): void {
    ensureNewOrLoaded(this);

    const { set } = this.opts;
    if (set === undefined) {
      throw new Error(`'set' not implemented on ${this}`);
    }
    set(this.entity as any, value);
  }

  setFromOpts(value: U): void {
    this.set(value);
  }

  // these callbacks should be no-ops as they ought to be handled by the underlying relations
  async onEntityDeletedAndFlushing(): Promise<void> {}
  onEntityDelete(): void {}
  async refreshIfLoaded(): Promise<void> {}

  toString(): string {
    return `CustomReference(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }
}

function ensureNewOrLoaded(reference: CustomReference<any, any, any, any>) {
  if (!(reference.isLoaded || reference.entity.isNewEntity)) {
    // This should only be callable in the type system if we've already resolved this to an instance
    throw new Error(`${reference.entity}.${reference.fieldName as string} was not loaded`);
  }
}
