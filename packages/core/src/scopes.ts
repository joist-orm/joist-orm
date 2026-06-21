import { isPlainObject } from "joist-utils";
import { alias, type Alias } from "./Aliases";
import { maybeGetMetadataForType } from "./configure";
import type { Entity } from "./Entity";
import type { ExpressionCondition, ExpressionFilter, FilterAndSettings } from "./EntityFilter";
import type { EntityManager, FindFilterOptions, MaybeAbstractEntityConstructor } from "./EntityManager";
import { type EntityMetadata, type Field, getBaseMeta, getMetadata } from "./EntityMetadata";
import type { Loaded, LoadHint } from "./loadHints";
import { parseEntityFilter } from "./QueryParser";
import type { FilterOf, OrderOf } from "./typeMap";

/** A predicate expressed against a bound alias, i.e. `(a) => a.age.gte(18)`. */
export type ScopeCondition<T extends Entity> = (a: Alias<T>) => ExpressionCondition | ExpressionCondition[];

/**
 * The fluent builder to either a) terminate/invoke or b) chain scope methods.
 *
 * I.e. `Author.adult` is a ScopeQuery that can either do `.find` or `.popular`.
 *
 * This `ScopeQuery` is just the terminal/invocation methods, the `.popular` methods
 * are chained on via the `Scope` mapped type below.
 */
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

/**
 * A per-entity, pre-typed function for declaring scopes.
 *
 * I.e. this is the type of the `import { authorScope as scope }` that entity files
 * use to declare their scopes.
 *
 * Because of the `authorScope as scope` rename, we can bake into the API that this
 * is the Author entity, and so simplify its usage.
 */
export interface ScopeFn<T extends Entity, R extends Scope<T>> {
  /** Defines a scope based on a filter condition, i.e. `scope({ name: "John" })` or `scope(a => a.name.eq("John")`. */
  (arg: FilterOf<T> | ScopeCondition<T>): R;
  /** Defines a parametrized filter, i.e. `scope(name => ({ name: { startsWith: name } }))`. */
  fn<A extends unknown[]>(fn: (...args: A) => ScopeCondition<T>): (...args: A) => R;
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
type FilterField = Field & { aliasSuffix: string };
type FilterAlias = { filter(value: unknown): ExpressionCondition };

// Use a symbol so stored scope fragments cannot collide with user-defined scope names.
const kOps = Symbol("scopeOps");
const kWithScopeOp = Symbol("scopeWithOp");

/** Creates a per-entity, pre-typed scope function. */
export function newScopeFn<T extends Entity, R extends Scope<T>>(entityType: string): ScopeFn<T, R> {
  // We won't immediately have access to the EntityMetadata during static field assignment, so provide a lazy handle
  const resolver: EntityCstrResolver<T> = {
    entityType,
    maybeGet: () => maybeGetMetadataForType<T>(entityType)?.cstr,
  };
  // Create the scopeFn
  function scopeFn(arg: FilterOf<T> | ScopeCondition<T>): R {
    return newScope(resolver, [toOp(arg)]) as R;
  }
  // But then also add the `.fn(...)` for parameterized scopes
  scopeFn.fn = function scopeFn<A extends unknown[]>(fn: (...args: A) => ScopeCondition<T>): (...args: A) => R {
    return (...args) => newScope(resolver, [{ kind: "cond", fn: fn(...args) }]);
  };
  return scopeFn;
}

/** Creates an immutable scope proxy with `ops` as its current scope fragments. */
function newScope<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): AnyScope<T> {
  return new Proxy(new ScopeTerminals(resolver, ops), {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) {
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
      const cstr = resolver.maybeGet();
      // During entity static initialization, metadata is not registered yet, so defer creating the scope ref.
      if (cstr === undefined) return makePendingScopeRef(resolver, ops, prop);
      // A sibling is another static scope on this entity, I.e. `Author.popular` when resolving `.popular`.
      const sibling = (cstr as MaybeAbstractEntityConstructor<T> & Record<string, unknown>)[prop];
      if (sibling === undefined) throw new Error(`Invalid scope ${resolver.entityType}.${prop}`);
      if (typeof sibling === "function" && !hasScopeOps(sibling)) {
        return function createParameterizedRef(...args: unknown[]): AnyScope<T> {
          return target[kWithScopeOp]({ kind: "ref", name: prop, args });
        };
      }
      return target[kWithScopeOp]({ kind: "ref", name: prop });
    },
  }) as AnyScope<T>;
}

/**
 * Concrete builder/terminal methods for a scope proxy.
 *
 * The outer proxy handles dynamic named-scope access like `.popular`; this class handles
 * fixed methods like `.where`, `.find`, and `.toFindArgs`.
 */
class ScopeTerminals<T extends Entity> {
  readonly #ops: ScopeOp<T>[];
  readonly #resolver: EntityCstrResolver<T>;

  constructor(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]) {
    this.#resolver = resolver;
    this.#ops = ops;
  }

  get [kOps](): ScopeOp<T>[] {
    return this.#ops;
  }

  where(arg: FilterOf<T> | ScopeCondition<T>): AnyScope<T> {
    return this[kWithScopeOp](toOp(arg));
  }

  orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): AnyScope<T> {
    return this[kWithScopeOp]({ kind: "orderBy", orderBy });
  }

  limit(limit: number): AnyScope<T> {
    return this[kWithScopeOp]({ kind: "limit", limit });
  }

  offset(offset: number): AnyScope<T> {
    return this[kWithScopeOp]({ kind: "offset", offset });
  }

  softDeletes(value: "include" | "exclude"): AnyScope<T> {
    return this[kWithScopeOp]({ kind: "softDeletes", value });
  }

  toFindArgs(): FilterAndSettings<T> {
    return compile(this.#resolver, this.#ops);
  }

  find(em: EntityManager): Promise<T[]>;
  find<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindOptionsWithPopulate<T> & { populate?: H },
  ): Promise<Loaded<T, H>[]>;
  find(em: EntityManager, opts?: FindOptionsWithPopulate<T>): Promise<T[]> {
    const args = compile(this.#resolver, this.#ops);
    return em.find(resolveCstr(this.#resolver), args.where, toFindOptions(args, opts));
  }

  findOne(em: EntityManager): Promise<T | undefined>;
  findOne<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindOptionsWithPopulate<T> & { populate?: H },
  ): Promise<Loaded<T, H> | undefined>;
  findOne(em: EntityManager, opts?: FindOptionsWithPopulate<T>): Promise<T | undefined> {
    const args = compile(this.#resolver, this.#ops);
    return em.findOne(resolveCstr(this.#resolver), args.where, toFindOptions(args, opts));
  }

  findOneOrFail(em: EntityManager): Promise<T>;
  findOneOrFail<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindOptionsWithPopulate<T> & { populate?: H },
  ): Promise<Loaded<T, H>>;
  findOneOrFail(em: EntityManager, opts?: FindOptionsWithPopulate<T>): Promise<T> {
    const args = compile(this.#resolver, this.#ops);
    return em.findOneOrFail(resolveCstr(this.#resolver), args.where, toFindOptions(args, opts));
  }

  findCount(em: EntityManager): Promise<number> {
    const args = compile(this.#resolver, this.#ops);
    return em.findCount(resolveCstr(this.#resolver), args.where, toCountOptions(args));
  }

  findIds(em: EntityManager): Promise<string[]> {
    const args = compile(this.#resolver, this.#ops);
    return em.findIds(resolveCstr(this.#resolver), args.where, toCountOptions(args));
  }

  /** Returns a new scope with one more recorded operation. */
  [kWithScopeOp](op: ScopeOp<T>): AnyScope<T> {
    return newScope(this.#resolver, [...this.#ops, op]);
  }
}

/** Compiles the ordered scope ops into Joist's existing find args shape. */
function compile<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): FilterAndSettings<T> {
  const cstr = resolveCstr(resolver);
  const a = alias(cstr);
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
  const meta = getMetadata(cstr);
  for (const where of wheres) addWhereConditions(a, meta, where, conditions, softDeletes ?? "exclude");

  return {
    where: { as: a } as FilterAndSettings<T>["where"],
    conditions: conditions.length ? { and: conditions } : undefined,
    orderBy: orderBys.length ? orderBys : undefined,
    limit,
    offset,
    softDeletes,
  };
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
  const plainScope = newScope(resolver, plainOps);
  function createParameterizedRef(...args: unknown[]): AnyScope<T> {
    return newScope(resolver, [...ops, { kind: "ref", name, args }]);
  }
  Object.defineProperty(createParameterizedRef, kOps, { value: plainOps });
  return new Proxy(createParameterizedRef, {
    get(_target, prop, receiver) {
      if (prop === kOps) return plainOps;
      return Reflect.get(plainScope as object, prop, receiver);
    },
    apply(_target, _thisArg, args: unknown[]) {
      return newScope(resolver, [...ops, { kind: "ref", name, args }]);
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

/** Extracts recorded scope ops from a resolved static field. */
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
function hasScopeOps<T extends Entity>(value: unknown): value is { readonly [kOps]: ScopeOp<T>[] } {
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

/** Converts root find filters into alias conditions so every scope where fragment is ANDed. */
function addWhereConditions<T extends Entity>(
  a: Alias<T>,
  meta: EntityMetadata<T>,
  where: FilterOf<T>,
  conditions: ExpressionCondition[],
  softDeletes: "include" | "exclude",
): void {
  if (!isPlainObject(where)) throw new Error(`Scope find filters must be plain objects for ${meta.type}`);

  for (const [key, value] of Object.entries(where as object as Record<string, unknown>)) {
    if (key === "as") continue;

    const field = findFilterField(meta, key);
    if (field === undefined) throw new Error(`Cannot safely compose scope filter ${meta.type}.${key}`);

    if (field.kind === "primaryKey" || field.kind === "primitive" || field.kind === "enum") {
      conditions.push(filterAlias(a, field).filter(value));
    } else if (field.kind === "m2o") {
      const filter = parseEntityFilter(field.otherMetadata(), value);
      if (filter === undefined) continue;
      if (filter.kind === "join")
        throw new Error(`Cannot safely compose scope filter ${meta.type}.${key} because it requires a join`);
      if (filterSoftDeletes(field.otherMetadata(), softDeletes))
        throw new Error(`Cannot safely compose scope filter ${meta.type}.${key} because the related entity has soft deletes`);
      conditions.push(filterAlias(a, field).filter(value));
    } else {
      throw new Error(`Cannot safely compose scope filter ${meta.type}.${key} because ${field.kind} fields are not supported`);
    }
  }
}

/** Finds a filter field by fieldName or generated fieldIdName. */
function findFilterField(meta: EntityMetadata, key: string): FilterField | undefined {
  return (
    meta.allFields[key] ??
    meta.polyComponentFields?.[key] ??
    Object.values(meta.allFields).find((field) => field.fieldIdName === key) ??
    Object.values(meta.polyComponentFields ?? {}).find((field) => field.fieldIdName === key)
  );
}

/** Returns the alias field object that can turn find filters into bound conditions. */
function filterAlias<T extends Entity>(a: Alias<T>, field: FilterField): FilterAlias {
  return (a as unknown as Record<string, FilterAlias>)[field.fieldName];
}

/** Returns true if normal find parsing would filter soft-deleted rows for this metadata. */
function filterSoftDeletes(meta: EntityMetadata, softDeletes: "include" | "exclude"): boolean {
  return (
    softDeletes === "exclude" &&
    !!getBaseMeta(meta).timestampFields?.deletedAt &&
    (meta.inheritanceType !== "cti" || meta.baseTypes.length === 0)
  );
}
