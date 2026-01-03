# Implementation Spec: Phase 1 - ReactiveCollection Core

## Technical Approach

Clone `ReactiveReferenceImpl` pattern but adapt for collections:
- Store `U[]` instead of `U | N`
- Use `joinRows()` API from `ManyToManyCollection` for persistence
- Implement read-only `Collection` interface (no `add`, `remove`, `set`)

## File Changes

### New Files

#### `packages/orm/src/relations/ReactiveCollection.ts`

```typescript
import {
  Collection,
  Entity,
  EntityMetadata,
  ensureNotDeleted,
  fail,
  getEmInternalApi,
  getInstanceData,
  getMetadata,
  isLoaded,
} from "..";
import { IsLoadedCachable } from "../IsLoadedCache";
import { lazyField, resolveOtherMeta } from "../newEntity";
import { Reacted, ReactiveHint, convertToLoadHint } from "../reactiveHints";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { RelationT, RelationU } from "./Relation";

export interface ReactiveCollection<T extends Entity, U extends Entity>
  extends Omit<Collection<T, U>, "add" | "remove" | "set" | "removeAll"> {
  readonly isLoaded: boolean;
  readonly isSet: boolean;
  load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<ReadonlyArray<U>>;
  readonly get: ReadonlyArray<U>;
  readonly getWithDeleted: ReadonlyArray<U>;
  /** Returns the as-of-last-flush previously-calculated collection. */
  readonly fieldValue: ReadonlyArray<U>;
}

export function hasReactiveCollection<
  T extends Entity,
  U extends Entity,
  const H extends ReactiveHint<T>,
>(
  joinTableName: string,
  columnName: string,
  otherMeta: EntityMetadata<U>,
  otherFieldName: keyof U & string,
  otherColumnName: string,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => readonly U[],
): ReactiveCollection<T, U> {
  return lazyField((entity: T, fieldName) => {
    otherMeta ??= resolveOtherMeta(entity, fieldName);
    return new ReactiveCollectionImpl<T, U, H>(
      joinTableName,
      entity,
      fieldName as keyof T & string,
      columnName,
      otherMeta,
      otherFieldName,
      otherColumnName,
      hint,
      fn,
    );
  });
}

export class ReactiveCollectionImpl<
    T extends Entity,
    U extends Entity,
    H extends ReactiveHint<T>,
  >
  extends AbstractRelationImpl<T, U[]>
  implements ReactiveCollection<T, U>, IsLoadedCachable
{
  readonly #fieldName: keyof T & string;
  readonly #otherMeta: EntityMetadata;
  readonly #reactiveHint: H;
  readonly #joinTableName: string;
  readonly #columnName: string;
  readonly #otherFieldName: keyof U & string;
  readonly #otherColumnName: string;

  #loaded: U[] | undefined;
  #loadedMode: "ref" | "full" | undefined = undefined;
  #isLoaded: boolean | undefined = undefined;
  #isCached: boolean = false;
  #loadPromise: Promise<ReadonlyArray<U>> | undefined;
  // Track the materialized DB state for change detection
  #fieldValueIds: Set<string> = new Set();

  constructor(
    joinTableName: string,
    entity: T,
    public fieldName: keyof T & string,
    columnName: string,
    otherMeta: EntityMetadata,
    otherFieldName: keyof U & string,
    otherColumnName: string,
    public reactiveHint: H,
    private fn: (entity: Reacted<T, H>) => readonly U[],
  ) {
    super(entity);
    this.#fieldName = fieldName;
    this.#otherMeta = otherMeta;
    this.#reactiveHint = reactiveHint;
    this.#joinTableName = joinTableName;
    this.#columnName = columnName;
    this.#otherFieldName = otherFieldName;
    this.#otherColumnName = otherColumnName;

    if (entity.isNewEntity) {
      this.#loaded = [];
      this.#loadedMode = "full";
      this.#isLoaded = true;
    }
    getInstanceData(entity).relations[fieldName] = this;
  }

  async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<ReadonlyArray<U>> {
    ensureNotDeleted(this.entity, "pending");
    const { loadHint } = this;

    if (!this.isLoaded || opts?.forceReload) {
      const { em } = this.entity;
      const maybeDirty = opts?.forceReload ||
        getEmInternalApi(em).rm.isMaybePendingRecalc(this.entity, this.fieldName);

      if (maybeDirty) {
        this.#isCached = false;
        return (this.#loadPromise ??= em.populate(this.entity, { hint: loadHint, ...opts }).then(() => {
          this.#loadPromise = undefined;
          this.#loadedMode = "full";
          this.#isLoaded = true;
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return this.doGet(opts);
        }));
      } else {
        // Load from join table (existing materialized state)
        return (this.#loadPromise ??= this.loadFromJoinTable().then((loaded) => {
          this.#loadPromise = undefined;
          this.#loadedMode = "ref";
          this.#isLoaded = true;
          this.#loaded = loaded;
          this.#fieldValueIds = new Set(loaded.map(e => e.idTagged));
          getEmInternalApi(this.entity.em).isLoadedCache.add(this);
          return this.filterDeleted(loaded, opts);
        }));
      }
    }
    return this.doGet(opts);
  }

  private async loadFromJoinTable(): Promise<U[]> {
    // Use existing m2m dataloader infrastructure
    const em = this.entity.em;
    // Query the join table for this entity's rows
    const rows = await getEmInternalApi(em).driver.loadManyToMany(
      em,
      this.#joinTableName,
      this.#columnName,
      [this.entity.idTagged],
      this.#otherColumnName,
    );
    // Load the related entities
    const ids = rows.map(r => r[this.#otherColumnName]);
    if (ids.length === 0) return [];
    return em.loadAll(this.#otherMeta.cstr, ids);
  }

  get isLoaded(): boolean {
    if (this.#isLoaded !== undefined) return this.#isLoaded;
    getEmInternalApi(this.entity.em).isLoadedCache.add(this);

    const maybeDirty = getEmInternalApi(this.entity.em).rm.isMaybePendingRecalc(this.entity, this.fieldName);
    if (maybeDirty) {
      this.#loadedMode = "full";
      this.#isLoaded = isLoaded(this.entity, this.loadHint);
      this.#isCached = false;
    } else {
      this.#isLoaded = !!this.#loadedMode;
    }
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    this.#isLoaded = undefined;
    this.#isCached = false;
  }

  private doGet(opts?: { withDeleted?: boolean }): ReadonlyArray<U> {
    const { fn } = this;
    ensureNotDeleted(this.entity, "pending");

    if (this.#isCached) {
      return this.filterDeleted(this.#loaded ?? [], opts);
    }

    if (this.isLoaded && this.#loadedMode === "full") {
      const newValue = fn(this.entity as any) as U[];

      if (!getEmInternalApi(this.entity.em).isValidating) {
        this.syncJoinTableRows(newValue);
      }

      this.#loaded = newValue;
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else if (!!this.#loadedMode) {
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    } else {
      const noun = this.entity.isNewEntity ? "derived" : "loaded";
      throw new Error(`${this.entity}.${this.fieldName} has not been ${noun} yet`);
    }

    return this.filterDeleted(this.#loaded ?? [], opts);
  }

  private syncJoinTableRows(newValue: U[]): void {
    const joinRows = getEmInternalApi(this.entity.em).joinRows(this);
    const newIds = new Set(newValue.map(e => e.idTagged));
    const oldIds = this.#fieldValueIds;

    // Find entities to add (in new but not in old)
    for (const entity of newValue) {
      if (!oldIds.has(entity.idTagged)) {
        joinRows.addNew(this, this.entity, entity);
      }
    }

    // Find entities to remove (in old but not in new)
    for (const oldId of oldIds) {
      if (!newIds.has(oldId)) {
        const entity = this.entity.em.getEntity(oldId) as U;
        if (entity) {
          joinRows.addRemove(this, this.entity, entity);
        }
      }
    }

    this.#fieldValueIds = newIds;
  }

  get fieldValue(): ReadonlyArray<U> {
    // Return the materialized DB state
    const ids = Array.from(this.#fieldValueIds);
    return ids.map(id => this.entity.em.getEntity(id) as U).filter(Boolean);
  }

  get getWithDeleted(): ReadonlyArray<U> {
    return this.doGet({ withDeleted: true });
  }

  get get(): ReadonlyArray<U> {
    return this.doGet({ withDeleted: false });
  }

  get isSet(): boolean {
    return this.#fieldValueIds.size > 0 || (this.#loaded !== undefined && this.#loaded.length > 0);
  }

  // Read-only - these throw errors
  add(_other: U): void {
    fail(`Cannot add to ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  remove(_other: U): void {
    fail(`Cannot remove from ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  set(_values: readonly U[]): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  removeAll(): void {
    fail(`Cannot removeAll on ${this.entity}.${this.fieldName} ReactiveCollection directly.`);
  }

  async includes(other: U): Promise<boolean> {
    const loaded = await this.load();
    return loaded.includes(other);
  }

  async find(id: string): Promise<U | undefined> {
    const loaded = await this.load();
    return loaded.find(e => e.id === id);
  }

  get loadHint(): any {
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.reactiveHint));
  }

  setFromOpts(_others: U[]): void {
    throw new Error(`ReactiveCollection ${this.entity}.${this.fieldName} cannot be set via opts`);
  }

  maybeCascadeDelete(): void {
    // ReactiveCollections don't cascade delete
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    // Clear the collection
    this.#loaded = [];
    this.#fieldValueIds.clear();
    this.#isLoaded = false;
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.filterDeleted(this.#loaded ?? [], opts) as U[];
  }

  public get otherMeta(): EntityMetadata {
    return this.#otherMeta;
  }

  public get hasBeenSet(): boolean {
    return false;
  }

  public get joinTableName(): string {
    return this.#joinTableName;
  }

  public get columnName(): string {
    return this.#columnName;
  }

  public get otherColumnName(): string {
    return this.#otherColumnName;
  }

  public get otherFieldName(): keyof U & string {
    return this.#otherFieldName;
  }

  private filterDeleted(entities: U[], opts?: { withDeleted?: boolean }): U[] {
    return opts?.withDeleted === true
      ? [...entities]
      : entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
  }

  public toString(): string {
    return `ReactiveCollection(entity: ${this.entity}, fieldName: ${this.fieldName}, otherMeta: ${this.#otherMeta.type})`;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

export function isReactiveCollection(maybeReactiveCollection: any): maybeReactiveCollection is ReactiveCollection<any, any> {
  return maybeReactiveCollection instanceof ReactiveCollectionImpl;
}
```

### Modified Files

#### `packages/orm/src/index.ts`

Add exports:

```typescript
export {
  hasReactiveCollection,
  isReactiveCollection,
  ReactiveCollection,
} from "./relations/ReactiveCollection";
```

#### `packages/orm/src/relations/index.ts`

Add exports:

```typescript
export * from "./ReactiveCollection";
```

## Implementation Details

### Join Table Integration

The `ReactiveCollectionImpl` needs to work with Joist's `joinRows` infrastructure. Key integration points:

1. **On calculation**: When `doGet()` recalculates, call `syncJoinTableRows()` to track adds/removes
2. **On load**: When loading from DB, populate `#fieldValueIds` to track materialized state
3. **On flush**: Join row changes are automatically persisted by existing infrastructure

### Change Detection

The `changes` API integration follows ReactiveReference pattern:
- `entity.changes.bestReviews.hasChanged` - true if calculated differs from DB
- `entity.changes.bestReviews.hasUpdated` - true if calculated value actually changed

### Loading Modes

Two modes like ReactiveReference:
- `"ref"`: Loaded from join table (materialized state)
- `"full"`: Loaded via reactive hint (can recalculate)

### Driver Integration

Need to verify `driver.loadManyToMany` exists or use the existing dataloader pattern from `ManyToManyCollection`.

## Testing Requirements

Phase 1 tests (basic sanity checks - comprehensive tests in Phase 2):

1. Can create ReactiveCollectionImpl instance
2. Can call `load()` on new entity
3. Can call `get` after load
4. Throws on direct modification attempts

## Error Handling

- Throw on `add()`, `remove()`, `set()`, `removeAll()` - these are read-only
- Throw on `.get` before load (like ReactiveReference)
- Propagate load errors appropriately

## Validation Commands

```bash
cd packages/orm && yarn build
cd packages/tests/integration && yarn test-stock -- ReactiveCollection
```
