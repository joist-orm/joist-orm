import { isPlainObject } from "joist-utils";
import { alias, type Alias } from "./Aliases";
import { maybeGetMetadataForType } from "./configure";
import type { Entity } from "./Entity";
import type { ExpressionCondition, ExpressionFilter, FilterAndSettings } from "./EntityFilter";
import type { EntityManager, FindFilterOptions, MaybeAbstractEntityConstructor } from "./EntityManager";
import type { Loaded, LoadHint } from "./loadHints";
import type { FilterOf, OrderOf } from "./typeMap";

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
    opts?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>[]>;
  findOne(em: EntityManager): Promise<T | undefined>;
  findOne<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H> | undefined>;
  findOneOrFail(em: EntityManager): Promise<T>;
  findOneOrFail<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>>;
  findCount(em: EntityManager): Promise<number>;
  findIds(em: EntityManager): Promise<string[]>;

  toFindArgs(): FilterAndSettings<T>;
}

/** A scope for entity `T`, with chainable named accessors supplied by `S`. */
export type Scope<T extends Entity, S = {}> = ScopeQuery<T> & S;

/** A per-entity, pre-typed function for declaring scopes. */
export interface ScopeFn<T extends Entity> {
  <R extends Scope<T> = AnyScope<T>>(arg: FilterOf<T> | ScopeCondition<T>): R;
  fn<A extends unknown[], R extends Scope<T> = AnyScope<T>>(fn: (...args: A) => ScopeCondition<T>): (...args: A) => R;
}

type AnyScope<T extends Entity> = Scope<T, any>;
interface EntityCstrResolver<T extends Entity> {
  entityType: string;
  /** Returns undefined while entity static fields run, before `configureMetadata` has populated the type map. */
  maybeGet(): MaybeAbstractEntityConstructor<T> | undefined;
}
type FindOptionsWithPopulate<T extends Entity> = FindFilterOptions<T> & { populate?: LoadHint<T> };

type ScopeOp<T extends Entity> =
  | { kind: "cond"; fn: ScopeCondition<T> }
  | { kind: "where"; where: FilterOf<T> }
  | { kind: "orderBy"; orderBy: OrderOf<T> | OrderOf<T>[] }
  | { kind: "limit"; limit: number }
  | { kind: "offset"; offset: number }
  | { kind: "softDeletes"; value: "include" | "exclude" }
  | { kind: "ref"; name: string; args?: unknown[] };
type ScopeRefOp<T extends Entity> = Extract<ScopeOp<T>, { kind: "ref" }>;
type ConditionField = Record<string, (...args: unknown[]) => ExpressionCondition>;

const kOps = Symbol("scopeOps");

/** Creates a per-entity, pre-typed scope function. */
export function newScopeFn<T extends Entity>(entityType: string): ScopeFn<T> {
  const resolver: EntityCstrResolver<T> = {
    entityType,
    maybeGet: () => maybeGetMetadataForType<T>(entityType)?.cstr,
  };

  function createScope(arg: FilterOf<T> | ScopeCondition<T>): AnyScope<T> {
    return makeScope(resolver, [toOp(arg)]);
  }

  createScope.fn = function scopeFn<A extends unknown[], R extends Scope<T> = AnyScope<T>>(
    fn: (...args: A) => ScopeCondition<T>,
  ): (...args: A) => R {
    return function createParameterizedScope(...args: A): R {
      return makeScope(resolver, [{ kind: "cond", fn: fn(...args) }]) as R;
    };
  };

  return createScope;
}

/** Creates an immutable scope proxy with `ops` as its current scope fragments. */
function makeScope<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): AnyScope<T> {
  function next(op: ScopeOp<T>): AnyScope<T> {
    return makeScope(resolver, [...ops, op]);
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
      return compile(resolver, ops);
    },
    find(em: EntityManager, opts?: FindOptionsWithPopulate<T>) {
      const args = compile(resolver, ops);
      return em.find(resolveCstr(resolver), args.where, toFindOptions(args, opts));
    },
    findOne(em: EntityManager, opts?: FindOptionsWithPopulate<T>) {
      const args = compile(resolver, ops);
      return em.findOne(resolveCstr(resolver), args.where, toFindOptions(args, opts));
    },
    findOneOrFail(em: EntityManager, opts?: FindOptionsWithPopulate<T>) {
      const args = compile(resolver, ops);
      return em.findOneOrFail(resolveCstr(resolver), args.where, toFindOptions(args, opts));
    },
    findCount(em: EntityManager) {
      const args = compile(resolver, ops);
      return em.findCount(resolveCstr(resolver), args.where, toCountOptions(args));
    },
    findIds(em: EntityManager) {
      const args = compile(resolver, ops);
      return em.findIds(resolveCstr(resolver), args.where, toCountOptions(args));
    },
  };

  return new Proxy(self, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
      const cstr = resolver.maybeGet();
      // During entity static initialization, metadata is not registered yet, so defer creating the scope ref.
      if (cstr === undefined) return makePendingScopeRef(resolver, ops, prop);
      // A sibling is another static scope on this entity, I.e. `Author.popular` when resolving `.popular`.
      const sibling = (cstr as MaybeAbstractEntityConstructor<T> & Record<string, unknown>)[prop];
      if (sibling === undefined) throw new Error(`Invalid scope ${resolver.entityType}.${prop}`);
      if (typeof sibling === "function" && !hasScopeOps(sibling)) {
        return function createParameterizedRef(...args: unknown[]): AnyScope<T> {
          return next({ kind: "ref", name: prop, args });
        };
      }
      return next({ kind: "ref", name: prop });
    },
  }) as AnyScope<T>;
}

/** Compiles the ordered scope ops into Joist's existing find args shape. */
function compile<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): FilterAndSettings<T> {
  const a = alias(resolveCstr(resolver));
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
          expand(scopeOpsForRef(resolver, op), seen);
          break;
        }
      }
    }
  }

  expand(ops, new Set());
  const remainingWheres = wheres.length > 1 ? splitWhereConditions(a, wheres, conditions) : wheres;

  return {
    where: remainingWheres.length ? Object.assign({ as: a }, ...remainingWheres) : { as: a },
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

/**
 * Creates a callable placeholder for refs captured before metadata maps are populated.
 *
 * This is not a one-time conversion: the proxy keeps the recorded ref ops, and every post-boot
 * `compile` resolves those refs through the now-populated entity constructor map.
 */
function makePendingScopeRef<T extends Entity>(
  resolver: EntityCstrResolver<T>,
  ops: ScopeOp<T>[],
  name: string,
): AnyScope<T> {
  const plainOps: ScopeOp<T>[] = [...ops, { kind: "ref", name }];
  const plainScope = makeScope(resolver, plainOps);
  function createParameterizedRef(...args: unknown[]): AnyScope<T> {
    return makeScope(resolver, [...ops, { kind: "ref", name, args }]);
  }
  Object.defineProperty(createParameterizedRef, kOps, { value: plainOps });
  return new Proxy(createParameterizedRef, {
    get(_target, prop, receiver) {
      if (prop === kOps) return plainOps;
      return Reflect.get(plainScope as object, prop, receiver);
    },
    apply(_target, _thisArg, args: unknown[]) {
      return makeScope(resolver, [...ops, { kind: "ref", name, args }]);
    },
  }) as AnyScope<T>;
}

/** Resolves a recorded named-scope ref to its underlying ops. */
function scopeOpsForRef<T extends Entity>(resolver: EntityCstrResolver<T>, op: ScopeRefOp<T>): ScopeOp<T>[] {
  const cstr = resolveCstr(resolver) as MaybeAbstractEntityConstructor<T> & Record<string, unknown>;
  const sibling = cstr[op.name];
  if (op.args) {
    if (typeof sibling !== "function") throw new Error(`Scope ${resolver.entityType}.${op.name} is not parameterized`);
    return scopeOpsFromValue(resolver, op.name, (sibling as (...args: unknown[]) => unknown)(...op.args));
  }
  return scopeOpsFromValue(resolver, op.name, sibling);
}

/** Extracts scope internals from a resolved static field. */
function scopeOpsFromValue<T extends Entity>(
  resolver: EntityCstrResolver<T>,
  name: string,
  value: unknown,
): ScopeOp<T>[] {
  if (hasScopeOps<T>(value)) return value[kOps];
  if (value === undefined) throw new Error(`Invalid scope ${resolver.entityType}.${name}`);
  if (typeof value === "function") throw new Error(`Scope ${resolver.entityType}.${name} requires arguments`);
  throw new Error(`${resolver.entityType}.${name} is not a scope`);
}

/** Returns true if `value` is one of our scope proxies. */
function hasScopeOps<T extends Entity>(value: unknown): value is ScopeInternals<T> {
  return (typeof value === "object" || typeof value === "function") && value !== null && kOps in value;
}

/** Resolves the lazy entity constructor. */
function resolveCstr<T extends Entity>(resolver: EntityCstrResolver<T>): MaybeAbstractEntityConstructor<T> {
  const cstr = resolver.maybeGet();
  if (cstr === undefined) throw new Error(`Unknown type ${resolver.entityType}`);
  return cstr;
}

/** Converts a scope declaration argument into a recorded op. */
function toOp<T extends Entity>(arg: FilterOf<T> | ScopeCondition<T>): ScopeOp<T> {
  return typeof arg === "function"
    ? { kind: "cond", fn: arg as ScopeCondition<T> }
    : { kind: "where", where: arg as FilterOf<T> };
}

/** Pulls the option half of `FilterAndSettings` back out for `em.find`. */
function toFindOptions<T extends Entity>(
  args: FilterAndSettings<T>,
  opts?: FindOptionsWithPopulate<T>,
): FindOptionsWithPopulate<T> {
  const { conditions, ...rest } = opts ?? {};
  return {
    orderBy: args.orderBy,
    limit: args.limit,
    offset: args.offset,
    softDeletes: args.softDeletes,
    ...rest,
    conditions: andConditions(args.conditions, conditions),
  };
}

/** Like `toFindOptions`, but drops the `orderBy`/`limit`/`offset` that `findCount`/`findIds` ignore. */
function toCountOptions<T extends Entity>(args: FilterAndSettings<T>): FindFilterOptions<T> {
  return { conditions: args.conditions, softDeletes: args.softDeletes };
}

/** ANDs two optional condition trees while preserving each tree's internal grouping. */
function andConditions(
  left: ExpressionFilter | undefined,
  right: ExpressionFilter | undefined,
): ExpressionFilter | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return { and: [left, right] };
}

/** Moves root-field object filters into alias conditions so repeated keys AND instead of last-winning. */
function splitWhereConditions<T extends Entity>(
  a: Alias<T>,
  wheres: FilterOf<T>[],
  conditions: ExpressionCondition[],
): FilterOf<T>[] {
  const remainingWheres: FilterOf<T>[] = [];
  for (const where of wheres) {
    const remaining = splitWhereCondition(a, where, conditions);
    if (remaining !== undefined) remainingWheres.push(remaining);
  }
  return remainingWheres;
}

/** Splits a single object filter into alias-compatible conditions and residual inline filters. */
function splitWhereCondition<T extends Entity>(
  a: Alias<T>,
  where: FilterOf<T>,
  conditions: ExpressionCondition[],
): FilterOf<T> | undefined {
  if (!isPlainObject(where)) return where;

  const remaining: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where as object as Record<string, unknown>)) {
    const fieldConditions = conditionsForAliasField(a, key, value);
    if (fieldConditions === undefined) {
      remaining[key] = value;
    } else {
      conditions.push(...fieldConditions);
    }
  }
  return Object.keys(remaining).length === 0 ? undefined : (remaining as FilterOf<T>);
}

/** Converts a root filter field into alias conditions, if the alias API supports that field. */
function conditionsForAliasField<T extends Entity>(
  a: Alias<T>,
  key: string,
  value: unknown,
): ExpressionCondition[] | undefined {
  try {
    return conditionsForAliasValue((a as object as Record<string, unknown>)[key], value);
  } catch {
    return undefined;
  }
}

/** Converts a single field's filter value into one or more alias conditions. */
function conditionsForAliasValue(field: unknown, value: unknown): ExpressionCondition[] | undefined {
  if (!isConditionField(field)) return undefined;
  if (Array.isArray(value)) return callConditionMethod(field, "in", value);
  if (isPlainObject(value)) return conditionsForAliasValueFilter(field, value as Record<string, unknown>);
  return callConditionMethod(field, "eq", value);
}

/** Converts an object value filter, I.e. `{ gte: 18 }`, into alias conditions. */
function conditionsForAliasValueFilter(
  field: ConditionField,
  filter: Record<string, unknown>,
): ExpressionCondition[] | undefined {
  const entries = Object.entries(filter);
  if (entries.length === 0) return [];
  if (entries.length === 2 && "op" in filter && "value" in filter) {
    return typeof filter.op === "string" ? conditionsForAliasValueOp(field, filter.op, filter.value) : undefined;
  }

  const conditions: ExpressionCondition[] = [];
  for (const [op, value] of entries) {
    const opConditions = conditionsForAliasValueOp(field, op, value);
    if (opConditions === undefined) return undefined;
    conditions.push(...opConditions);
  }
  return conditions;
}

/** Converts a single value-filter operation into alias conditions. */
function conditionsForAliasValueOp(
  field: ConditionField,
  op: string,
  value: unknown,
): ExpressionCondition[] | undefined {
  if (op === "between") {
    return Array.isArray(value) && value.length === 2 ? callConditionMethod(field, op, value[0], value[1]) : undefined;
  }
  return callConditionMethod(field, op, value);
}

/** Calls an alias condition method if it exists on this field. */
function callConditionMethod(
  field: ConditionField,
  name: string,
  ...args: unknown[]
): ExpressionCondition[] | undefined {
  const method = field[name];
  return typeof method === "function" ? [method.apply(field, args)] : undefined;
}

/** Returns true if `value` looks like a field alias with condition methods. */
function isConditionField(value: unknown): value is ConditionField {
  return typeof value === "object" && value !== null;
}
