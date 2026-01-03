# Contract: ReactiveCollection for M2M Tables

## Problem Statement

Joist ORM has `ReactiveField` for derived primitive values and `ReactiveReference` for derived foreign key references, both of which:
- Take a reactive hint specifying dependencies
- Auto-recalculate when dependencies change
- Persist the materialized value to the database

**Gap**: There is no equivalent for many-to-many collections. Users cannot define a derived/calculated collection that:
- Automatically computes its membership based on a reactive hint
- Persists the result to a join table
- Recalculates when dependencies in the subgraph change

## Goals

1. **Create `ReactiveCollection<T, U>`** - A read-only, derived collection relation type
2. **Follow existing patterns** - Clone `ReactiveReference` implementation approach
3. **Reactive hint integration** - Accept `ReactiveHint<T>` to specify dependencies
4. **Database persistence** - Store collection membership in standard m2m join tables
5. **Change tracking** - Track adds/removes as changes, flush to join table like `ManyToManyCollection`

## Success Criteria

1. **API Parity**: `hasReactiveCollection()` works analogously to `hasReactiveReference()`
   ```typescript
   hasReactiveCollection<T, U, H>(
     otherMeta: EntityMetadata<U>,
     fieldName: keyof T & string,
     hint: H,
     fn: (entity: Reacted<T, H>) => readonly U[],
   )
   ```

2. **Reactive Recalculation**: Collection recalculates when any field in the reactive hint changes

3. **Read-Only**: Collection is derived - no `add()`, `remove()`, or `set()` methods exposed

4. **Persistence**: Join table rows are inserted/deleted on `em.flush()` to match calculated collection

5. **Tests Pass**: Comprehensive test suite modeled after `ReactiveReference.test.ts`

6. **Type Safety**: `Reacted<T, H>` ensures only declared hint fields are accessible in fn

## Scope

### In Scope
- `ReactiveCollection` class implementation (clone from `ReactiveReference`)
- `hasReactiveCollection()` factory function
- Integration with `convertToLoadHint()` for reactive hints
- Integration with `IsLoadedCache` for cache invalidation
- Join table row management via `getEmInternalApi(em).joinRows()`
- `ReactiveCollection.test.ts` test suite (clone from `ReactiveReference.test.ts`)
- TypeScript types and exports
- **Test schema**: New m2m table `authors_to_best_reviews` between `Author` and `BookReview`
  - `Author.bestReviews` - ReactiveCollection containing all reviews with rating >= 5
  - Reactive hint: `{ books: { reviews: "rating" } }`
  - Function: filters reviews by rating threshold

### In Scope (Phase 3 - Other Side Handling)
- **ReactiveCollectionOtherSide class** - Read-only collection for the non-controlling side
- Auto-detection of "other side" when one side is `derived: "async"`
- `derived: "otherSide"` metadata flag for the non-controlling side
- **Codegen integration**: Auto-generate `hasReactiveCollectionOtherSide()` in Codegen files
- **Pending changes visibility**: Other side reflects unflushed changes from controlling side
- **Changes API**: Other side participates in `entity.changes.fieldName` tracking
- Update `configure.ts` to recognize `derived: "otherSide"` for reactive tracking

### Out of Scope
- Schema migration tooling
- Documentation updates
- Mutable reactive collections (add/remove with reactive defaults)
- Performance optimizations beyond baseline

## Constraints

- Must integrate with existing Joist entity lifecycle (flush, populate, etc.)
- Must use existing join table infrastructure from `ManyToManyCollection`
- Must not break existing `ReactiveField` or `ReactiveReference` behavior
- Tests must run via `yarn test-stock` in `packages/tests/integration/`
