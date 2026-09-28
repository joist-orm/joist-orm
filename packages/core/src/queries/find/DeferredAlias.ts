import type { EntityMetadata } from "src/EntityMetadata.ts";
import { type PredicateBrand, brandPredicate } from "src/queries/conditions.ts";
// Erased imports keep domain predicates independent of the query parser at module load time.
import type { AliasMgmt } from "src/queries/find/Aliases.ts";
import type { ColumnCondition, RawCondition } from "src/queries/parsedConditions.ts";

export const deferredAliasSym: unique symbol = Symbol("joist.deferredAliasCondition");

/** Resolves a domain alias to this em.find parse's binding. */
export type AliasResolver = (handle: AliasMgmt) => {
  meta: EntityMetadata;
  alias: string;
};

/** A domain condition whose SQL aliases are resolved afresh for each occurrence in em.find. */
export interface DeferredAliasCondition<C = ColumnCondition | RawCondition> extends PredicateBrand<"domain"> {
  [deferredAliasSym]: (resolve: AliasResolver) => C;
}

/** Detects conditions that carry a per-parse alias resolver. */
export function isDeferredAliasCondition<C>(cond: C): cond is C & DeferredAliasCondition<C> {
  return typeof cond === "object" && cond !== null && deferredAliasSym in cond;
}

/** Tags a condition without changing its enumerable shape; resolution only mutates a fresh copy. */
export function withDeferredAlias<C extends object>(
  cond: C,
  resolve: (r: AliasResolver, copy: C) => void,
): C & DeferredAliasCondition<C> {
  return Object.defineProperty(brandPredicate(cond, "domain"), deferredAliasSym, {
    value: (r: AliasResolver) => {
      const copy = { ...cond };
      resolve(r, copy);
      return copy;
    },
    enumerable: false,
  }) as C & DeferredAliasCondition<C>;
}
