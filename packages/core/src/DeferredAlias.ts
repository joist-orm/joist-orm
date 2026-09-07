// Erased imports keep domain predicates and SQL expressions independent at module load time.
import type { EntityMetadata } from "./EntityMetadata.ts";
import type { ColumnCondition, RawCondition } from "./QueryParser.ts";

/** An undefined predicate is pruned by either query parser. */
export const skipCondition: ColumnCondition = {
  kind: "column",
  alias: "skip",
  column: "skip",
  dbType: "skip",
  cond: undefined as any,
};

export const deferredAliasSym: unique symbol = Symbol("joist.deferredAliasCondition");

/** Resolves a domain alias or physical table handle to this parse's binding. */
export type AliasResolver = (handle: { meta: EntityMetadata; tableName: string }) => {
  meta: EntityMetadata;
  alias: string;
};

/** A condition whose SQL aliases are resolved afresh for each occurrence in a query. */
export interface DeferredAliasCondition<C = ColumnCondition | RawCondition> {
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
  return Object.defineProperty(cond, deferredAliasSym, {
    value: (r: AliasResolver) => {
      const copy = { ...cond };
      resolve(r, copy);
      return copy;
    },
    enumerable: false,
  }) as C & DeferredAliasCondition<C>;
}
