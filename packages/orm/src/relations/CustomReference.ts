import { Entity } from "../Entity";
import { IdOf, TaggedId } from "../EntityManager";
import { Reference, ensureNotDeleted, fail } from "../index";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ReferenceN } from "./Reference";
import { RelationT, RelationU } from "./Relation";

export type CustomReferenceOpts<T extends Entity, U extends Entity, N extends never | undefined> = {
  // We purposefully don't capture the return value of `load` b/c we want `get` to re-calc from `entity`
  // each time it's invoked so that it reflects any changed values.
  load: (entity: T, opts: { forceReload?: boolean }) => Promise<unknown>;
  get: (entity: T) => U | N;
  set?: (entity: T, other: U) => void;
  /** Whether the reference is loaded, even w/o an explicit `.load` call, i.e. for DeepNew test instances. */
  isLoaded?: () => boolean;
};

/**
 * Allows user-defined references that will work in `populate` / preload hints.
 *
 * This works because Joist's `populate`/preloading is not based on creating giant SQL joins,
 * but instead by just walking "1 dataloader per level". Given this, we don't really care
 * what happens at each "level" of resolution, as long as: a) it's a promise, and b) the
 * caller uses dataloader to be batch friendly.
 *
 * This `CustomReference` API is fairly low-level; users should more likely prefer higher-level
 * abstractions like `hasOneThrough`, which are built on `CustomReference.
 */
export class CustomReference<T extends Entity, U extends Entity, N extends never | undefined>
  extends AbstractRelationImpl<U>
  implements Reference<T, U, N>
{
  readonly #entity: T;
  // We keep both a promise+loaded flag and not an actual `this.loaded = await load` because
  // the value can become stale; we want to each `.get` call to repeatedly evaluate the latest value.
  private loadPromise: Promise<unknown> | undefined;
  private _isLoaded = false;

  constructor(
    entity: T,
    private opts: CustomReferenceOpts<T, U, N>,
  ) {
    super();
    this.#entity = entity;
  }

  get get(): U | N {
    return this.doGet({ withDeleted: false });
  }

  get getWithDeleted(): U | N {
    return this.doGet({ withDeleted: true });
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<U | N> {
    ensureNotDeleted(this.#entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      if (this.loadPromise === undefined) {
        this.loadPromise = this.opts.load(this.#entity, opts);
        await this.loadPromise;
        this.loadPromise = undefined;
        this._isLoaded = true;
      } else {
        await this.loadPromise;
      }
    }
    return this.doGet(opts);
  }

  get isPreloaded(): boolean {
    return false;
  }

  preload(): void {
    throw new Error("Not implemented");
  }

  get id(): IdOf<U> {
    return fail(`CustomReference cannot resolve 'id'`);
  }

  get idMaybe(): IdOf<U> | undefined {
    return fail(`CustomReference cannot resolve 'idMaybe'`);
  }

  get idTaggedMaybe(): TaggedId | undefined {
    return fail(`CustomReference cannot resolve 'idTaggedMaybe'`);
  }

  get idUntagged(): string {
    return fail(`CustomReference cannot resolve 'idUntagged'`);
  }

  get idUntaggedMaybe(): string | undefined {
    return fail(`CustomReference cannot resolve 'idUntaggedMaybe'`);
  }

  get isSet(): boolean {
    this.ensureNewOrLoaded();
    const { get } = this.opts;
    return get(this.#entity) !== undefined;
  }

  set(value: U): void {
    // We allow setting CustomReferences on new entities w/o being loaded
    if (!this.#entity.isNewEntity) {
      this.ensureNewOrLoaded();
    }
    const { set } = this.opts;
    if (set === undefined) {
      throw new Error(`'set' not implemented on ${this}`);
    }
    set(this.#entity, value);
  }

  setFromOpts(value: U): void {
    this.set(value);
  }

  // these callbacks should be no-ops as they ought to be handled by the underlying relations
  async cleanupOnEntityDeleted(): Promise<void> {}
  maybeCascadeDelete(): void {}

  /** Finds this CustomReferences field name by looking in the entity for the key that we're assigned to. */
  get fieldName(): string {
    return Object.entries(this.#entity).filter((e) => e[1] === this)[0][0];
  }

  toString(): string {
    return `CustomReference(entity: ${this.#entity}, fieldName: ${this.fieldName})`;
  }

  private doGet(opts?: { withDeleted?: boolean }): U | N {
    ensureNotDeleted(this.#entity, "pending");
    this.ensureNewOrLoaded();
    return this.filterDeleted(this.opts.get(this.#entity), opts);
  }

  private filterDeleted(entity: U | N, opts?: { withDeleted?: boolean }): U | N {
    return opts?.withDeleted === true || entity === undefined || !entity.isDeletedEntity ? entity : (undefined as N);
  }

  private ensureNewOrLoaded() {
    // This should only be callable in the type system if we've already resolved this to an instance
    if (this.isLoaded || (this.opts.isLoaded && this.opts.isLoaded())) {
      return;
    }
    fail(`${this.#entity}.${this.fieldName} was not loaded`);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
  [ReferenceN]: N = null!;
}
