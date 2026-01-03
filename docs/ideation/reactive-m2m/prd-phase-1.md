# PRD Phase 1: ReactiveCollection Core Implementation

## Overview

Implement the core `ReactiveCollection` class and `hasReactiveCollection()` factory function by cloning and adapting the existing `ReactiveReference` implementation.

## Rationale

Phase 1 establishes the foundation. By cloning the proven `ReactiveReference` pattern, we ensure consistency with existing reactive types and leverage battle-tested infrastructure.

## User Stories

1. **As a developer**, I want to declare a derived m2m collection on my entity so that related entities are automatically calculated based on business logic.

2. **As a developer**, I want the collection to recalculate when its dependencies change so that the materialized join table stays in sync.

3. **As a developer**, I want type-safe access to the reactive hint fields so that I catch errors at compile time.

## Functional Requirements

### FR-1: ReactiveCollection Class

Create `ReactiveCollection<T, U>` implementing a read-only collection interface:

```typescript
export interface ReactiveCollection<T extends Entity, U extends Entity> {
  readonly isLoaded: boolean;
  readonly isSet: boolean;
  load(opts?: { withDeleted?: boolean; forceReload?: boolean }): Promise<ReadonlyArray<U>>;
  get: ReadonlyArray<U>;
  readonly fieldValue: ReadonlyArray<U>;
}
```

**Requirements:**
- FR-1.1: `isLoaded` returns true when the reactive hint is loaded and collection is calculated
- FR-1.2: `isSet` returns true when there is a materialized value (from DB or calculation)
- FR-1.3: `load()` populates the reactive hint, invokes the function, and returns the calculated collection
- FR-1.4: `get` returns the calculated collection if loaded, throws if not
- FR-1.5: `fieldValue` returns the materialized DB value without recalculation

### FR-2: hasReactiveCollection Factory

Create factory function following `hasReactiveReference` pattern:

```typescript
export function hasReactiveCollection<
  T extends Entity,
  U extends Entity,
  const H extends ReactiveHint<T>,
>(
  otherMeta: EntityMetadata<U>,
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => readonly U[],
): ReactiveCollection<T, U>;
```

**Requirements:**
- FR-2.1: Accept `EntityMetadata<U>` for the collection's entity type
- FR-2.2: Accept field name for join table naming
- FR-2.3: Accept `ReactiveHint<T>` specifying dependencies
- FR-2.4: Accept function that receives `Reacted<T, H>` and returns `U[]`
- FR-2.5: Return lazy field that creates `ReactiveCollectionImpl` on first access

### FR-3: Reactive Hint Integration

**Requirements:**
- FR-3.1: Convert reactive hint to load hint via `convertToLoadHint()`
- FR-3.2: Cache converted load hint in `meta.config.__data.cachedReactiveLoadHints`
- FR-3.3: Use `IsLoadedCache` for mutation tracking and cache invalidation

### FR-4: Join Table Management

**Requirements:**
- FR-4.1: Use `getEmInternalApi(em).joinRows()` for join table row tracking
- FR-4.2: Track added entities (new rows to insert) when calculation differs from DB
- FR-4.3: Track removed entities (rows to delete) when calculation differs from DB
- FR-4.4: Ensure changes are flushed on `em.flush()`

### FR-5: Change Detection

**Requirements:**
- FR-5.1: Detect when recalculation is needed via `isMaybePendingRecalc()` or equivalent
- FR-5.2: Mark field as changed when calculated value differs from materialized value
- FR-5.3: Support `entity.changes.fieldName.hasChanged` and `hasUpdated`

## Non-Functional Requirements

- NFR-1: Performance should be comparable to `ReactiveReference` for single entity operations
- NFR-2: Must not break existing `ReactiveField` or `ReactiveReference` functionality
- NFR-3: TypeScript types must provide full autocomplete and error checking

## Dependencies

**Prerequisites:**
- Existing `ReactiveReference` implementation for reference
- Existing `ManyToManyCollection` for join table patterns
- `convertToLoadHint()` and `IsLoadedCache` infrastructure

**Outputs:**
- `ReactiveCollectionImpl` class
- `hasReactiveCollection()` factory
- Exported types from `packages/orm/src/index.ts`

## Acceptance Criteria

- [ ] `ReactiveCollectionImpl` class exists in `packages/orm/src/relations/`
- [ ] `hasReactiveCollection()` factory function is exported
- [ ] Types are exported from main index
- [ ] Can manually declare `bestReviews: ReactiveCollection<Author, BookReview>` on Author entity
- [ ] Collection recalculates when reactive hint dependencies change
- [ ] Join table rows are tracked and flushed correctly
- [ ] No regressions in existing reactive type tests
