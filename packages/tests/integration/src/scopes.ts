import type { EntityManager } from "@src/entities";
import {
  Alias,
  alias,
  Entity,
  ExpressionCondition,
  FilterAndSettings,
  FilterOf,
  FindFilterOptions,
  Loaded,
  LoadHint,
  MaybeAbstractEntityConstructor,
  OrderOf,
} from "joist-orm";

// =============================================================================
// WIP prototype: Rails-style scopes for Joist.
//
// FINDING (the thing this prototype set out to test):
//
//   `Scope<T, typeof Entity>` — auto-discovering scope names from the entity
//   constructor's static members — DOES NOT TYPE-CHECK. It fails with:
//     - TS2615: "Type of property 'adult' circularly references itself in mapped type"
//     - TS2502: "'adult' is referenced directly or indirectly in its own type annotation"
//   i.e. `{ [K in keyof typeof Author]: ... (typeof Author)[K] ... }` is a circular
//   mapped type, and `static adult: Scope<Author, typeof Author>` is a self-referential
//   annotation. The "no hand-written interface" ergonomic is not reachable this way.
//
//   What you see below is the WORKING fallback: an explicit `XxxScopes` interface
//   (which codegen could generate) parameterizes the scope. The recursion then runs
//   through a *named interface* (like a tree node), which TS handles fine.
//
//   The `typeof Entity` form, for the record (does NOT compile):
//     type ScopeNames<C> = { [K in keyof C]: NonNullable<C[K]> extends { [b]?: any } ? K : never }[keyof C];
//     type Scope<T, C> = ScopeQuery<T> & { [K in ScopeNames<C>]: ... Scope<T, C> ... };
// =============================================================================

/** A predicate expressed against a bound alias, e.g. `(a) => a.age.gte(18)`. */
export type ScopeCondition<T extends Entity> = (a: Alias<T>) => ExpressionCondition | ExpressionCondition[];

/** The fluent builder + terminal surface shared by every scope. */
export interface ScopeQuery<T extends Entity> {
  where(where: FilterOf<T>): this;
  where(fn: ScopeCondition<T>): this;
  orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): this;
  limit(limit: number): this;
  offset(offset: number): this;
  softDeletes(softDeletes: "include" | "exclude"): this;

  find(em: EntityManager): Promise<T[]>;
  find<const H extends LoadHint<T>>(
    em: EntityManager,
    opts: FindFilterOptions<T> & { populate: H },
  ): Promise<Loaded<T, H>[]>;
  findOne(em: EntityManager): Promise<T | undefined>;
  findCount(em: EntityManager): Promise<number>;

  toFindArgs(): FilterAndSettings<T>;
}

/**
 * A scope for entity `T`, with chainable named accessors supplied by the concrete
 * scopes-map `S` (e.g. `AuthorScopes`). `S` lists the sibling scope names; the
 * recursion `S -> Scope<T, S> -> S` goes through a named interface, so it type-checks
 * (unlike the `typeof Entity` mapped-type form — see the note above).
 */
export type Scope<T extends Entity, S = {}> = ScopeQuery<T> & S;

/**
 * The loose return type of the `scope()` / `scopeFn()` factories. `Scope<T, any>` collapses to
 * `any`, which is assignable to any `Scope<T, S>` — so call sites need no generics and the
 * `static adult: AuthorScope = …` annotation supplies the real (chainable) type. The factory's
 * *input* (`arg`) is still fully type-checked; only the (immediately-annotated) output is loose.
 * No non-`any` type can be assignable to an arbitrary user-defined scopes-map, so this is required.
 */
type AnyScope<T extends Entity> = Scope<T, any>;

/**
 * Declare a named scope. `T` is inferred from `cstr`, so no generics are needed:
 *
 *   static adult: Scope<Author> = scope(Author, { age: { gte: 18 } });
 *   static popular: Scope<Author> = scope(Author, (a) => a.isPopular.eq(true));
 */
export function scope<T extends Entity>(
  cstr: MaybeAbstractEntityConstructor<T>,
  arg: FilterOf<NoInfer<T>> | ScopeCondition<NoInfer<T>>,
): AnyScope<T>;
export function scope(cstr: any, arg: any): any {
  const op: ScopeOp = typeof arg === "function" ? { kind: "cond", fn: arg } : { kind: "where", where: arg };
  return makeScope(cstr, [op]);
}

/**
 * Declare a parameterized named scope. `T` is inferred from `cstr`:
 *
 *   static named: (p: string) => Scope<Author> = scopeFn(Author, (p: string) => (a) => a.firstName.like(`${p}%`));
 */
export function scopeFn<A extends any[], T extends Entity = Entity>(
  cstr: MaybeAbstractEntityConstructor<T>,
  fn: (...args: A) => ScopeCondition<NoInfer<T>>,
): (...args: A) => AnyScope<T> {
  return ((...args: A) => makeScope(cstr, [{ kind: "cond", fn: fn(...args) }])) as any;
}

// --- runtime (untyped internals; public types come from the signatures above) ---

const kOps = Symbol("scopeOps");

type ScopeOp =
  | { kind: "cond"; fn: ScopeCondition<any> }
  | { kind: "where"; where: any }
  | { kind: "orderBy"; orderBy: any }
  | { kind: "limit"; limit: number }
  | { kind: "offset"; offset: number }
  | { kind: "softDeletes"; value: "include" | "exclude" }
  | { kind: "ref"; name: string; args?: any[] };

function makeScope(cstr: any, ops: ScopeOp[]): any {
  const next = (op: ScopeOp) => makeScope(cstr, [...ops, op]);
  const self: any = {
    [kOps]: ops,
    where: (arg: any) => {
      const op: ScopeOp = typeof arg === "function" ? { kind: "cond", fn: arg } : { kind: "where", where: arg };
      return next(op);
    },
    orderBy: (orderBy: any) => next({ kind: "orderBy", orderBy }),
    limit: (limit: number) => next({ kind: "limit", limit }),
    offset: (offset: number) => next({ kind: "offset", offset }),
    softDeletes: (value: "include" | "exclude") => next({ kind: "softDeletes", value }),
    toFindArgs: () => compile(cstr, ops),
    find: (em: any, opts?: any) => {
      const { where, ...rest } = compile(cstr, ops);
      return em.find(cstr, where, { ...rest, ...opts });
    },
    findOne: (em: any) => {
      const { where, ...rest } = compile(cstr, ops);
      return em.findOne(cstr, where, rest);
    },
    findCount: (em: any) => {
      const { where, ...rest } = compile(cstr, ops);
      return em.findCount(cstr, where, rest);
    },
  };
  return new Proxy(self, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
      const sibling = cstr[prop];
      if (sibling === undefined) return undefined;
      // A parameterized scope static is a function; a plain scope static is an object.
      if (typeof sibling === "function") return (...args: any[]) => next({ kind: "ref", name: prop, args });
      return next({ kind: "ref", name: prop });
    },
  });
}

function compile(cstr: any, ops: ScopeOp[]): any {
  const a = alias(cstr);
  const conditions: any[] = [];
  const wheres: any[] = [];
  const orderBys: any[] = [];
  let limit: number | undefined;
  let offset: number | undefined;
  let softDeletes: "include" | "exclude" | undefined;

  const expand = (ops: ScopeOp[], seen: Set<string>) => {
    for (const op of ops) {
      switch (op.kind) {
        case "cond": {
          const r = op.fn(a);
          conditions.push(...(Array.isArray(r) ? r : [r]));
          break;
        }
        case "where":
          wheres.push(op.where);
          break;
        case "orderBy":
          if (Array.isArray(op.orderBy)) orderBys.push(...op.orderBy);
          else orderBys.push(op.orderBy);
          break;
        case "limit":
          limit = op.limit;
          break;
        case "offset":
          offset = op.offset;
          break;
        case "softDeletes":
          softDeletes = op.value;
          break;
        case "ref": {
          const key = op.name + (op.args ? JSON.stringify(op.args) : "");
          if (seen.has(key)) break;
          seen.add(key);
          const sibling = op.args ? cstr[op.name](...op.args) : cstr[op.name];
          expand(sibling[kOps], seen);
          break;
        }
      }
    }
  };
  expand(ops, new Set());

  return {
    where: wheres.length ? Object.assign({ as: a }, ...wheres) : { as: a },
    conditions: conditions.length ? { and: conditions } : undefined,
    orderBy: orderBys.length ? orderBys : undefined,
    limit,
    offset,
    softDeletes,
  };
}
