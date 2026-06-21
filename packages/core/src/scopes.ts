import { alias, type Alias } from "./Aliases";
import { getMetadataForType } from "./configure";
import type { Entity } from "./Entity";
import type { ExpressionCondition, FilterAndSettings } from "./EntityFilter";
import type { FindFilterOptions, MaybeAbstractEntityConstructor } from "./EntityManager";
import type { Loaded, LoadHint } from "./loadHints";
import type { FilterOf, OrderOf } from "./typeMap";
import type { EntityManager } from "./EntityManager";

/** A predicate expressed against a bound alias, i.e. `(a) => a.age.gte(18)`. */
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

/** A scope for entity `T`, with chainable named accessors supplied by `S`. */
export type Scope<T extends Entity, S = {}> = ScopeQuery<T> & S;

/** A per-entity, pre-typed factory for declaring scopes. */
export interface ScopeFactory<T extends Entity> {
  <R extends Scope<T> = AnyScope<T>>(arg: FilterOf<T> | ScopeCondition<T>): R;
  fn<A extends unknown[], R extends Scope<T> = AnyScope<T>>(
    fn: (...args: A) => ScopeCondition<T>,
  ): (...args: A) => R;
}

type AnyScope<T extends Entity> = Scope<T, any>;
type ScopeConstructorResolver<T extends Entity> = () => MaybeAbstractEntityConstructor<T>;
type FindOptionsWithPopulate<T extends Entity> = FindFilterOptions<T> & { populate?: LoadHint<T> };

type ScopeOp<T extends Entity> =
  | { kind: "cond"; fn: ScopeCondition<T> }
  | { kind: "where"; where: FilterOf<T> }
  | { kind: "orderBy"; orderBy: OrderOf<T> | OrderOf<T>[] }
  | { kind: "limit"; limit: number }
  | { kind: "offset"; offset: number }
  | { kind: "softDeletes"; value: "include" | "exclude" }
  | { kind: "ref"; name: string; args?: unknown[] };

const kOps = Symbol("scopeOps");

/** Creates a per-entity, pre-typed scope factory. */
export function newScopeFactory<T extends Entity>(entityType: string): ScopeFactory<T> {
  function getCstr(): MaybeAbstractEntityConstructor<T> {
    return getMetadataForType(entityType).cstr;
  }

  function createScope(arg: FilterOf<T> | ScopeCondition<T>): AnyScope<T> {
    return makeScope(getCstr, [toOp(arg)]);
  }

  createScope.fn = function scopeFn<A extends unknown[], R extends Scope<T> = AnyScope<T>>(
    fn: (...args: A) => ScopeCondition<T>,
  ): (...args: A) => R {
    return function createParameterizedScope(...args: A): R {
      return makeScope(getCstr, [{ kind: "cond", fn: fn(...args) }]) as R;
    };
  };

  return createScope;
}

/** Creates an immutable scope proxy with `ops` as its current scope fragments. */
function makeScope<T extends Entity>(getCstr: ScopeConstructorResolver<T>, ops: ScopeOp<T>[]): AnyScope<T> {
  function next(op: ScopeOp<T>): AnyScope<T> {
    return makeScope(getCstr, [...ops, op]);
  }

  const self = {
    [kOps]: ops,
    where(arg: FilterOf<T> | ScopeCondition<T>) {
      return next(toOp(arg));
    },
    orderBy(orderBy: OrderOf<T> | OrderOf<T>[]) {
      return next({ kind: "orderBy", orderBy });
    },
    limit(limit: number) {
      return next({ kind: "limit", limit });
    },
    offset(offset: number) {
      return next({ kind: "offset", offset });
    },
    softDeletes(value: "include" | "exclude") {
      return next({ kind: "softDeletes", value });
    },
    toFindArgs() {
      return compile(getCstr, ops);
    },
    find(em: EntityManager, opts?: FindOptionsWithPopulate<T>) {
      const args = compile(getCstr, ops);
      return em.find(resolveCstr(getCstr), args.where, { ...toFindOptions(args), ...opts });
    },
    findOne(em: EntityManager) {
      const args = compile(getCstr, ops);
      return em.findOne(resolveCstr(getCstr), args.where, toFindOptions(args));
    },
    findCount(em: EntityManager) {
      const args = compile(getCstr, ops);
      return em.findCount(resolveCstr(getCstr), args.where, toFindOptions(args));
    },
  };

  return new Proxy(self, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
      const sibling = (resolveCstr(getCstr) as MaybeAbstractEntityConstructor<T> & Record<string, unknown>)[prop];
      if (sibling === undefined) return undefined;
      if (typeof sibling === "function") {
        return function createParameterizedRef(...args: unknown[]): AnyScope<T> {
          return next({ kind: "ref", name: prop, args });
        };
      }
      return next({ kind: "ref", name: prop });
    },
  }) as AnyScope<T>;
}

/** Compiles the ordered scope ops into Joist's existing find args shape. */
function compile<T extends Entity>(getCstr: ScopeConstructorResolver<T>, ops: ScopeOp<T>[]): FilterAndSettings<T> {
  const a = alias(resolveCstr(getCstr));
  const conditions: ExpressionCondition[] = [];
  const wheres: FilterOf<T>[] = [];
  const orderBys: OrderOf<T>[] = [];
  let limit: number | undefined;
  let offset: number | undefined;
  let softDeletes: "include" | "exclude" | undefined;

  function expand(currentOps: ScopeOp<T>[], seen: Set<string>): void {
    for (const op of currentOps) {
      switch (op.kind) {
        case "cond": {
          const result = op.fn(a);
          conditions.push(...(Array.isArray(result) ? result : [result]));
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
          const cstr = resolveCstr(getCstr) as MaybeAbstractEntityConstructor<T> & Record<string, unknown>;
          const sibling = op.args ? (cstr[op.name] as (...args: unknown[]) => ScopeInternals<T>)(...op.args) : cstr[op.name];
          expand((sibling as ScopeInternals<T>)[kOps], seen);
          break;
        }
      }
    }
  }

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

interface ScopeInternals<T extends Entity> {
  [kOps]: ScopeOp<T>[];
}

/** Resolves the lazy entity constructor. */
function resolveCstr<T extends Entity>(getCstr: ScopeConstructorResolver<T>): MaybeAbstractEntityConstructor<T> {
  return getCstr();
}

/** Converts a scope declaration argument into a recorded op. */
function toOp<T extends Entity>(arg: FilterOf<T> | ScopeCondition<T>): ScopeOp<T> {
  return typeof arg === "function"
    ? { kind: "cond", fn: arg as ScopeCondition<T> }
    : { kind: "where", where: arg as FilterOf<T> };
}

/** Pulls the option half of `FilterAndSettings` back out for `em.find`. */
function toFindOptions<T extends Entity>(args: FilterAndSettings<T>): FindFilterOptions<T> {
  return {
    conditions: args.conditions,
    orderBy: args.orderBy,
    limit: args.limit,
    offset: args.offset,
    softDeletes: args.softDeletes,
  };
}
