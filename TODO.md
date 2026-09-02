# em.query follow-ups

Carried over from the `em-query-plan.md` design doc (deleted when `em.query` shipped); see
`docs/src/content/docs/features/queries-raw.md` for what exists today.

## Features

- [ ] **CTE hoisting**: subqueries always render as inline derived tables; hoist named/repeated
      subqueries into `WITH` (dedupe by identity, dependency-ordered). Cosmetic until a subquery is
      used twice, since PG 12+ inlines single-use CTEs.
- [ ] **Entity mode for joined aliases**: `select: a` only works for the `from` alias.
- [ ] Explicitly deferred (documented under "Not (Yet) Supported"): UNION/INTERSECT/EXCEPT,
      user-authored and recursive CTEs, DISTINCT ON, first-class window functions and
      `FILTER (WHERE ...)` (all reachable via `sql` today), entity mode plus extra computed columns.

## Type-level

- [ ] **Scope-check coverage** — decided against extending it: the "alias 'x' is not in from/join"
      check stays on the POJO `select` only. A `where`/`having`/`orderBy` version was built and
      reverted (see e51a37ca): it needed a phantom `Condition<Src>` brand on every condition method
      plus three inferred generics on `QueryArg`, and array best-common-type reduction absorbs a
      nested `{ and: [...] }` group that sits beside a sibling condition, so its coverage was
      confusingly leaky - while the runtime already fails fast with a named alias on every path.
      Revisit only if the runtime error proves insufficient in practice.
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
