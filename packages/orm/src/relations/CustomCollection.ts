import { Entity } from "../Entity";
import { getEmInternalApi, IdOf } from "../EntityManager";
import { Collection, ensureNotDeleted, fail, LoadHint } from "../index";
import { lazyRelation } from "../newEntity";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

export type CustomCollectionOpts<T extends Entity, U extends Entity> = {
  // We purposefully don't capture the return value of `load` b/c we want `get` to re-calc from `entity`
  // each time it's invoked so that it reflects any changed values.
  load: (entity: T, opts: { forceReload?: boolean }) => Promise<any>;
  get: (entity: T) => readonly U[];
  set?: (entity: T, other: U[]) => void;
  find?: (entity: T, id: IdOf<U>) => U | undefined;
  add?: (entity: T, other: U) => void;
  remove?: (entity: T, other: U) => void;
  /** Whether the reference is loaded, even w/o an explicit `.load` call, i.e. for DeepNew test instances. */
  isLoaded: (entity: T) => boolean;
  /**
   * A load hint that can be used to speculatively traverse the dependencies of this collection.  Currently
   * only used by em.importEntity and can be omitted if the collection isn't used with it.
   */
  loadHint?: ((entity: T) => LoadHint<T>) | LoadHint<T>;
};

export function hasCustomCollection<T extends Entity, U extends Entity>(
  opts: CustomCollectionOpts<T, U>,
): CustomCollection<T, U> {
  return lazyRelation((entity: T) => {
    return new CustomCollection<T, U>(entity, opts);
  });
}

/**
 * Allows user-defined collections that will work in `populate` / preload hints.
 *
 * This works because Joist's `populate`/preloading is not based on creating giant SQL joins,
 * but instead by just walking "1 dataloader per level". Given this, we don't really care
 * what happens at each "level" of resolution, as long as: a) it's a promise, and b) the
 * caller uses dataloader to be batch friendly.
 *
 * This `CustomCollection` API is fairly low-level; users should more likely prefer higher-level
 * abstractions like `hasManyThrough`, which are built on `CustomCollection`.
 */
export class CustomCollection<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, readonly U[]>
  implements Collection<T, U>
{
  // We keep both a promise+loaded flag and not an actual `this.loaded = await load` because
  // the values can become stale; we want to each `.get` call to repeatedly evaluate the latest values.
  private loadPromise: Promise<any> | undefined;
  #hasBeenSet = false;
  #isLoaded: boolean | undefined = undefined;
  #loadHint: LoadHint<T> | undefined;

  constructor(
    entity: T,
    private opts: CustomCollectionOpts<T, U>,
  ) {
    super(entity);
  }

  get get(): readonly U[] {
    return this.doGet({ withDeleted: false });
  }

  get getWithDeleted(): readonly U[] {
    return this.doGet({ withDeleted: true });
  }

  get isLoaded(): boolean {
    if (this.#isLoaded !== undefined) return this.#isLoaded;
    getEmInternalApi(this.entity.em).isLoadedCache.addNaive(this);
    this.#isLoaded = this.opts.isLoaded(this.entity);
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    this.#isLoaded = undefined;
  }

  get loadHint(): LoadHint<T> | undefined {
    if (this.#loadHint === undefined && this.opts.loadHint !== undefined) {
      const { loadHint } = this.opts;
      this.#loadHint = typeof loadHint === "function" ? loadHint(this.entity) : loadHint;
    }
    return this.#loadHint;
  }

  async load(opts: { withDeleted?: boolean; forceReload?: boolean } = {}): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");
    if (!this.isLoaded || opts.forceReload) {
      if (this.loadPromise === undefined) {
        this.loadPromise = this.opts.load(this.entity, opts);
        await this.loadPromise;
        this.loadPromise = undefined;
        this.#isLoaded = true;
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

  set(values: U[]): void {
    this.ensureNewOrLoaded();
    const { set, add, remove } = this.opts;
    if (set !== undefined) {
      set(this.entity, values);
      this.#hasBeenSet = true;
    } else if (add !== undefined && remove !== undefined) {
      const current = this.get;
      current.filter((value) => !values.includes(value)).forEach((value) => this.remove(value));
      values.filter((value) => !current.includes(value)).forEach((value) => this.add(value));
      this.#hasBeenSet = true;
    } else {
      fail(`'set' not implemented and not inferrable from 'add'/'remove' on ${this}`);
    }
  }

  setFromOpts(values: U[]): void {
    this.set(values);
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    if (!this.isLoaded) {
      await this.load();
    }
    const { find } = this.opts;
    if (find === undefined) {
      return this.doGet().find((other) => other.id === id);
    } else {
      return find(this.entity, id);
    }
  }

  async includes(other: U): Promise<boolean> {
    throw new Error("Not implemented");
  }

  add(other: U): void {
    this.ensureNewOrLoaded();
    const { add } = this.opts;
    if (add === undefined) {
      fail(`'add' not implemented on ${this}`);
    }
    add(this.entity, other);
  }

  remove(other: U): void {
    this.ensureNewOrLoaded();
    const { remove } = this.opts;
    if (remove === undefined) {
      fail(`'add' not implemented on ${this}`);
    }
    remove(this.entity, other);
  }

  // these callbacks should be no-ops as they ought to be handled by the underlying relations
  async cleanupOnEntityDeleted(): Promise<void> {}
  maybeCascadeDelete(): void {}

  /** Finds this CustomCollections field name by looking in the entity for the key that we're assigned to. */
  get fieldName(): string {
    // Something about running with the transformations breaks the `[0][0]` and it can NPE
    return Object.entries(this.entity).filter((e) => e[1] === this)[0]?.[0];
  }

  get hasBeenSet() {
    return this.#hasBeenSet;
  }

  toString(): string {
    return `CustomCollection(entity: ${this.entity}, fieldName: ${this.fieldName})`;
  }

  private doGet(opts?: { withDeleted?: boolean }): readonly U[] {
    ensureNotDeleted(this.entity, "pending");
    this.ensureNewOrLoaded();
    return this.filterDeleted(this.opts.get(this.entity), opts);
  }

  private filterDeleted(entities: readonly U[], opts?: { withDeleted?: boolean }): readonly U[] {
    return entities.filter((entity) => opts?.withDeleted === true || !entity.isDeletedEntity);
  }

  private ensureNewOrLoaded() {
    // This should only be callable in the type system if we've already resolved this to an instance
    if (this.isLoaded) {
      return;
    }
    fail(`${this.entity}.${this.fieldName} was not loaded`);
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}
