# em.query follow-ups

Carried over from the `em-query-plan.md` design doc (deleted when `em.query` shipped); see
`docs/src/content/docs/features/queries-raw.md` for what exists today.

## Features

- [ ] **Alias hover docs**: per-relation JSDoc on `a.books` requires doc comments on the codegen'd
      `*Fields` entries (mapped types propagate key docs from their source type). Decided *against*
      codegen'd `AuthorAlias` interfaces: the `Alias<T>` mapped type is cached per entity, measured
      cheap on tsc 7 (~2.4ms per realistic query), auto-updates when core's alias/factory types
      change, and threads the self-join `Name` parameter naturally; revisit only if a real app's
      `tsc --generateTrace` shows `Alias` instantiations hot.
- [ ] **Soft-delete injection**: inject `deleted_at IS NULL` for joined soft-deletable entities the
      way `em.find` does, as pruneable conditions in the join's `on`.
- [ ] **CTE hoisting**: subqueries always render as inline derived tables; hoist named/repeated
      subqueries into `WITH` (dedupe by identity, dependency-ordered). Cosmetic until a subquery is
      used twice, since PG 12+ inlines single-use CTEs.
- [ ] **Entity mode for joined aliases**: `select: a` only works for the `from` alias.
- [ ] **Poly components as `in` targets**: `c.parent.in(query({ ..., select: a.id }))` needs the
      component chosen from the subquery's element type (the `eq`/join case works via alias columns).
- [ ] Explicitly deferred (documented under "Not (Yet) Supported"): UNION/INTERSECT/EXCEPT,
      user-authored and recursive CTEs, DISTINCT ON, first-class window functions and
      `FILTER (WHERE ...)` (all reachable via `sql` today), entity mode plus extra computed columns.

## Type-level

- [ ] **Scope-check coverage**: the "alias 'x' is not in from/join" check covers the POJO `select`
      only; extending it to `where`/`having`/`orderBy` needs a `Src` parameter on `ExpressionCondition`.
- [ ] **Scalar subquery nullability**: always `R | null` today, but an ungrouped aggregate never
      returns no row, so `.coalesce(0)` is a little noisy. A type-level special case may not be worth it.
- [ ] **`Src` conflates scope and nullability**: `coalesce` wants to keep the scope identity and drop
      only the nullability; today it drops both (`Src = never`). Split the brand into
      `{ source; nullableBy }` if that ever bites.

## Toolchain

- [ ] **tsc 7.0.2 `--build` phantom errors**: right after tsdown rewrites `build/`, `tsc --build`
      (the `typecheck:watch` path) sporadically reports thousands of phantom "Module 'joist-orm' has
      no exported member ..." errors and caches them in `.tsbuildinfo`, replaying them on later runs.
      Fresh builds are clean and per-package `tsc --composite false` (what `yarn build` runs) always
      passes. Repro: clean `tsc --build --emitDeclarationOnly` → append any export to a core src file
      → `tsdown` → `tsc --build --emitDeclarationOnly` again (fails roughly half the time;
      `--singleThreaded` does not help; never reproduced on pre-em.query main). Mitigated by removing
      the `EntityManager.ts` ↔ `query.ts` declaration cycle (`runQuery` → `parseUserQuery` plus a
      structural `EntityHydrator`) — risk reduction, not a proven fix. If it recurs: delete
      `packages/**/*.tsbuildinfo` and restart the watch (a plain restart replays the cached
      diagnostics), and consider reporting the recipe to microsoft/typescript-go.
