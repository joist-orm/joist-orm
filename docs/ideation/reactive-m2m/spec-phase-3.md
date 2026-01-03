# Implementation Spec: Phase 3 - ReactiveCollection Other Side

## Technical Approach

1. **Metadata changes**: Add `"otherSide"` to derived types, auto-detect in codegen
2. **New implementation**: `ReactiveCollectionOtherSideImpl` - simpler than `ReactiveCollectionImpl` (no derivation function)
3. **Pending changes**: Leverage existing `JoinRows` to see controlling side's pending changes
4. **Codegen**: Generate `hasReactiveCollectionOtherSide()` calls for other-side fields

## File Changes

### Modified Files

#### `packages/orm/src/EntityMetadata.ts`

Update `ManyToManyField.derived` type:

```typescript
export type ManyToManyField = {
  kind: "m2m";
  // ... existing fields ...
  derived: "async" | "otherSide" | false;  // Add "otherSide"
};
```

#### `packages/codegen/src/EntityDbMetadata.ts`

Update codegen's `ManyToManyField.derived` type:

```typescript
export type ManyToManyField = Field & {
  kind: "m2m";
  // ... existing fields ...
  derived: "async" | "otherSide" | false;  // Add "otherSide"
};
```

Update `newManyToManyField()` to auto-detect other side:

```typescript
function newManyToManyField(config: Config, entity: Entity, r: M2MRelation): ManyToManyField {
  // ... existing code ...

  // Check if this side is explicitly derived
  const isThisSideDerived = isReactiveCollection(config, entity, fieldName);

  // Check if the OTHER side is derived (making this the "otherSide")
  const isOtherSideDerived = isReactiveCollection(config, otherEntity, otherFieldName);

  const derived = isThisSideDerived ? "async"
    : isOtherSideDerived ? "otherSide"
    : false;

  return {
    // ... existing fields ...
    derived,
  };
}
```

#### `packages/codegen/src/generateEntityCodegenFile.ts`

Update m2m generation to handle `"otherSide"`:

```typescript
// Around line 1022-1037
const m2m: Relation[] = meta.manyToManys.map((m2m) => {
  const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName, derived } = m2m;

  if (derived === "async") {
    // Controlling side - abstract, user defines in entity file
    const line = code`abstract readonly ${fieldName}: ${ReactiveCollection}<${entity.name}, ${otherEntity.type}>;`;
    return { kind: "abstract", line } as const;
  }

  if (derived === "otherSide") {
    // Other side - auto-generated read-only collection
    const decl = code`${ReadOnlyCollection}<${entity.type}, ${otherEntity.type}>`;
    const init = code`
      ${hasReactiveCollectionOtherSide}(
        "${joinTableName}",
        "${columnName}",
        "${otherFieldName}",
        "${otherColumnName}",
      )`;
    return { kind: "concrete", fieldName, decl, init };
  }

  // Regular m2m
  const decl = code`${Collection}<${entity.type}, ${otherEntity.type}>`;
  const init = code`
    ${hasManyToMany}(
      "${joinTableName}",
      "${columnName}",
      "${otherFieldName}",
      "${otherColumnName}",
    )`;
  return { kind: "concrete", fieldName, decl, init };
});
```

Add import for `hasReactiveCollectionOtherSide` and `ReadOnlyCollection`:

```typescript
import {
  // ... existing imports ...
  hasReactiveCollectionOtherSide,
  ReadOnlyCollection,
} from "joist-orm";
```

Update opts generation to skip "otherSide" fields (already skips "async"):

```typescript
// generateOptFields - around line 476
const m2m = meta.manyToManys
  .filter(({ derived }) => !derived) // Skip both "async" AND "otherSide"
  .map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type}[];`;
  });

// generateOptIdsFields - around line 546
const m2m = meta.manyToManys
  .filter(({ derived }) => !derived) // Skip both "async" AND "otherSide"
  .map(({ singularName, otherEntity }) => {
    return code`${singularName}Ids?: ${otherEntity.idType}[] | null;`;
  });
```

#### `packages/codegen/src/generateMetadataFile.ts`

Already handles `derived` property - no changes needed since we're updating the derived value in `newManyToManyField()`.

#### `packages/orm/src/configure.ts`

Update reactive fields detection to include "otherSide":

```typescript
// Around line 250-256
const reactiveFields = Object.values(meta.allFields).filter(
  (f) =>
    f.kind === "primitive" ||
    (f.kind === "m2o" && f.derived === "async") ||
    (f.kind === "enum" && f.derived === "async") ||
    (f.kind === "m2m" && (f.derived === "async" || f.derived === "otherSide")),
);
```

### New Files

#### `packages/orm/src/relations/ReactiveCollectionOtherSide.ts`

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
  IdOf,
} from "..";
import { manyToManyDataLoader } from "../dataloaders/manyToManyDataLoader";
import { lazyField, resolveOtherMeta } from "../newEntity";
import { AbstractRelationImpl } from "./AbstractRelationImpl";
import { ManyToManyCollection } from "./ManyToManyCollection";
import { RelationT, RelationU } from "./Relation";

/**
 * A read-only collection representing the "other side" of a ReactiveCollection.
 *
 * When Author.bestReviews is a ReactiveCollection (controlling side),
 * BookReview.bestReviewAuthors is a ReactiveCollectionOtherSide (read-only view).
 */
export interface ReactiveCollectionOtherSide<T extends Entity, U extends Entity>
  extends Omit<Collection<T, U>, "add" | "remove" | "set" | "removeAll"> {
  readonly isLoaded: boolean;
  load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]>;
  readonly get: U[];
  readonly getWithDeleted: U[];
}

/** Creates a ReactiveCollectionOtherSide - the read-only other side of a ReactiveCollection. */
export function hasReactiveCollectionOtherSide<T extends Entity, U extends Entity>(
  joinTableName: string,
  columnName: string,
  otherFieldName: string,
  otherColumnName: string,
): ReactiveCollectionOtherSide<T, U> {
  let otherMeta: EntityMetadata<U>;
  return lazyField((entity: T, fieldName) => {
    otherMeta ??= resolveOtherMeta(entity, fieldName);
    return new ReactiveCollectionOtherSideImpl<T, U>(
      joinTableName,
      entity,
      fieldName as keyof T & string,
      columnName,
      otherMeta,
      otherFieldName,
      otherColumnName,
    );
  });
}

export class ReactiveCollectionOtherSideImpl<T extends Entity, U extends Entity>
  extends AbstractRelationImpl<T, U[]>
  implements ReactiveCollectionOtherSide<T, U>
{
  readonly #fieldName: keyof T & string;
  readonly #otherMeta: EntityMetadata;

  // M2M join table metadata
  readonly #joinTableName: string;
  readonly #columnName: string;
  readonly #otherFieldName: string;
  readonly #otherColumnName: string;

  // Loading state
  #loaded: U[] | undefined;
  #isLoaded: boolean = false;
  #loadPromise: Promise<readonly U[]> | undefined;

  constructor(
    joinTableName: string,
    entity: T,
    public fieldName: keyof T & string,
    columnName: string,
    otherMeta: EntityMetadata,
    otherFieldName: string,
    otherColumnName: string,
  ) {
    super(entity);
    this.#fieldName = fieldName;
    this.#otherMeta = otherMeta;
    this.#joinTableName = joinTableName;
    this.#columnName = columnName;
    this.#otherFieldName = otherFieldName;
    this.#otherColumnName = otherColumnName;

    if (entity.isNewEntity) {
      this.#loaded = [];
      this.#isLoaded = true;
    }
    getInstanceData(entity).relations[fieldName] = this;
  }

  async load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<readonly U[]> {
    ensureNotDeleted(this.entity, "pending");

    if (!this.#isLoaded || opts?.forceReload) {
      return (this.#loadPromise ??= this.loadFromJoinTable().then((loaded) => {
        this.#loadPromise = undefined;
        this.#loaded = loaded;
        this.#isLoaded = true;
        return this.applyPendingChangesAndFilter(loaded, opts);
      }));
    }
    return this.applyPendingChangesAndFilter(this.#loaded ?? [], opts);
  }

  private async loadFromJoinTable(): Promise<U[]> {
    const { em } = this.entity;
    const key = `${this.#columnName}=${this.entity.id}`;
    const result = await manyToManyDataLoader(em, this as any).load(key);
    return result as U[];
  }

  get isLoaded(): boolean {
    return this.#isLoaded;
  }

  get get(): U[] {
    return this.doGet({ withDeleted: false });
  }

  get getWithDeleted(): U[] {
    return this.doGet({ withDeleted: true });
  }

  private doGet(opts?: { withDeleted?: boolean }): U[] {
    ensureNotDeleted(this.entity, "pending");
    if (!this.#isLoaded) {
      throw new Error(`${this.entity}.${this.fieldName} has not been loaded yet`);
    }
    return this.applyPendingChangesAndFilter(this.#loaded ?? [], opts);
  }

  /**
   * Apply pending changes from the controlling side and filter deleted entities.
   *
   * This reads from JoinRows to see what the controlling side has added/removed
   * but not yet flushed. We look up pending changes by finding the controlling
   * side's collection and checking for pairs that include this entity.
   */
  private applyPendingChangesAndFilter(baseEntities: U[], opts?: { withDeleted?: boolean }): U[] {
    const em = this.entity.em;

    // Start with loaded entities
    const result = new Set(baseEntities);

    // Find pending adds/removes from the controlling side
    // The controlling side's collection stores pairs as (controllingEntity, otherEntity)
    // We need to find pairs where otherEntity === this.entity
    const allJoinRows = getEmInternalApi(em).joinRowsPointer;
    if (allJoinRows) {
      // Look through all collections' pending changes
      for (const [collection, newRows] of allJoinRows.newRows) {
        // Check if this collection is the "other side" of our relationship
        if (collection.joinTableName === this.#joinTableName &&
            collection.otherFieldName === this.#fieldName) {
          // This is the controlling side - check its pending adds
          for (const [controllingEntity, otherEntity] of newRows) {
            if (otherEntity === this.entity) {
              result.add(controllingEntity as U);
            }
          }
        }
      }

      for (const [collection, removedRows] of allJoinRows.removedRows) {
        if (collection.joinTableName === this.#joinTableName &&
            collection.otherFieldName === this.#fieldName) {
          for (const [controllingEntity, otherEntity] of removedRows) {
            if (otherEntity === this.entity) {
              result.delete(controllingEntity as U);
            }
          }
        }
      }
    }

    // Filter deleted unless withDeleted
    let entities = [...result];
    if (opts?.withDeleted !== true) {
      entities = entities.filter((e) => !e.isDeletedEntity && !(e as any).isSoftDeletedEntity);
    }

    return entities;
  }

  // Read-only - these throw errors
  add(_other: U): void {
    fail(`Cannot add to ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  remove(_other: U): void {
    fail(`Cannot remove from ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  set(_values: readonly U[]): void {
    fail(`Cannot set ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  removeAll(): void {
    fail(`Cannot removeAll on ${this.entity}.${this.fieldName} - it is the read-only other side of a ReactiveCollection.`);
  }

  async includes(other: U): Promise<boolean> {
    const loaded = await this.load();
    return loaded.includes(other);
  }

  async find(id: IdOf<U>): Promise<U | undefined> {
    const loaded = await this.load();
    return loaded.find((e) => e.id === id);
  }

  setFromOpts(_others: U[]): void {
    throw new Error(`ReactiveCollectionOtherSide ${this.entity}.${this.fieldName} cannot be set via opts`);
  }

  maybeCascadeDelete(): void {
    // Don't cascade - the controlling side handles this
  }

  async cleanupOnEntityDeleted(): Promise<void> {
    this.#loaded = [];
    this.#isLoaded = false;
  }

  current(opts?: { withDeleted?: boolean }): U[] {
    return this.applyPendingChangesAndFilter(this.#loaded ?? [], opts);
  }

  // Properties for JoinRows compatibility
  public get meta(): EntityMetadata {
    return getMetadata(this.entity);
  }

  public get otherMeta(): EntityMetadata {
    return this.#otherMeta;
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

  public get otherFieldName(): string {
    return this.#otherFieldName;
  }

  public get hasBeenSet(): boolean {
    return false;
  }

  public toString(): string {
    return `ReactiveCollectionOtherSide(entity: ${this.entity}, fieldName: ${this.fieldName}, otherMeta: ${this.#otherMeta.type})`;
  }

  [RelationT]: T = null!;
  [RelationU]: U = null!;
}

export function isReactiveCollectionOtherSide(
  maybeCollection: any,
): maybeCollection is ReactiveCollectionOtherSide<any, any> {
  return maybeCollection instanceof ReactiveCollectionOtherSideImpl;
}
```

#### `packages/orm/src/relations/index.ts`

Add exports:

```typescript
export {
  ReactiveCollectionOtherSide,
  ReactiveCollectionOtherSideImpl,
  hasReactiveCollectionOtherSide,
  isReactiveCollectionOtherSide,
} from "./ReactiveCollectionOtherSide";
```

#### `packages/orm/src/index.ts`

Add exports:

```typescript
export {
  hasReactiveCollectionOtherSide,
  isReactiveCollectionOtherSide,
  ReactiveCollectionOtherSide,
} from "./relations/ReactiveCollectionOtherSide";
```

### JoinRows Usage (No Changes Needed)

The existing `JoinRows` infrastructure already tracks all pending add/remove operations. The other side implementation queries the same data but filters by the "other" entity in the pair.

When `Author.bestReviews` calls `joinRows.addNew(collection, author, bookReview)`, this stores the pair. The other side (`BookReview.bestReviewAuthors`) can iterate the same data looking for pairs where `bookReview === this.entity`.

The `ReactiveCollectionOtherSideImpl` handles this lookup internally without requiring new JoinRows methods.

## Implementation Details

### Auto-Detection Logic

The auto-detection happens in `newManyToManyField()`:

1. For m2m table `authors_to_best_reviews`:
   - When processing `Author`, check if `bestReviews` is marked `derived: "async"` in config → yes → `derived: "async"`
   - When processing `BookReview`, check if `bestReviewAuthors` is marked → no → check if OTHER side (`Author.bestReviews`) is marked → yes → `derived: "otherSide"`

### Pending Changes Flow

1. User calls `author.bestReviews.get` → ReactiveCollectionImpl calculates and calls `joinRows.addNew()`
2. User calls `bookReview.bestReviewAuthors.get` → ReactiveCollectionOtherSideImpl:
   - Loads committed rows from DB
   - Queries `joinRows.getNewRowsForOtherSide()` for pending adds
   - Queries `joinRows.getRemovedRowsForOtherSide()` for pending removes
   - Returns merged result

### ReadOnlyCollection Type

Consider creating a `ReadOnlyCollection<T, U>` type alias:

```typescript
export type ReadOnlyCollection<T extends Entity, U extends Entity> =
  Omit<Collection<T, U>, "add" | "remove" | "set" | "removeAll">;
```

Or simply use `ReactiveCollectionOtherSide<T, U>` directly.

## Testing Requirements

Add tests to `ReactiveCollection.test.ts`:

```typescript
describe("other side", () => {
  it("is read-only", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const br = newBookReview(em, { book: newBook(em, { author: a }), rating: 5 });
    await em.flush();

    expect(() => br.bestReviewAuthors.add(a)).toThrow("read-only");
    expect(() => br.bestReviewAuthors.remove(a)).toThrow("read-only");
  });

  it("reflects pending adds from controlling side", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const br = newBookReview(em, { book: newBook(em, { author: a }), rating: 5 });
    await em.flush();

    // Load both sides
    await a.bestReviews.load();
    await br.bestReviewAuthors.load();

    // a.bestReviews now includes br (rating >= 5)
    expect(a.bestReviews.get).toContain(br);
    // Other side should also see it (pending, not yet flushed)
    expect(br.bestReviewAuthors.get).toContain(a);
  });

  it("reflects pending removes from controlling side", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const br = newBookReview(em, { book: newBook(em, { author: a }), rating: 5 });
    await em.flush();

    // Reload and change rating below threshold
    const em2 = newEntityManager();
    const a2 = await em2.load(Author, a.id);
    const br2 = await em2.load(BookReview, br.id);

    br2.rating = 3; // Below threshold
    await a2.bestReviews.load(); // Recalculates, removes br2
    await br2.bestReviewAuthors.load();

    expect(a2.bestReviews.get).not.toContain(br2);
    expect(br2.bestReviewAuthors.get).not.toContain(a2);
  });

  it("participates in changes API", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const br = newBookReview(em, { book: newBook(em, { author: a }), rating: 5 });
    await em.flush();

    const em2 = newEntityManager();
    const br2 = await em2.load(BookReview, br.id, "bestReviewAuthors");

    // Change rating to add author to bestReviews
    br2.book.get.author.get; // Need author loaded
    await br2.book.get.author.get.bestReviews.load();

    expect(br2.changes.bestReviewAuthors.hasChanged).toBe(true);
  });
});
```

## Validation Commands

```bash
cd packages/orm && yarn build
cd packages/codegen && yarn build
cd packages/tests/integration && yarn joist-codegen
cd packages/tests/integration && yarn build
cd packages/tests/integration && yarn test-stock -- ReactiveCollection
```
