import { baseEntityCstr } from "./BaseEntity";
import { Entity } from "./Entity";
import { EntityConstructor, EntityManager } from "./EntityManager";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { getLazyFields } from "./getProperties";
import { fail } from "./utils";

// Marks a constructor like Author has having had our relation getters installed
const lazySymbol = Symbol("lazy");

/**
 * Constructs an instance of `cstr` but with relations all made lazy.
 *
 * Specifically we avoid going through `new` b/c that invokes the `constructor` which instantiates
 * the instance-level class fields/relations like `hooks = hasMany`.
 *
 * Instead, we just call `Object.create`, which does not make any constructor/super calls, and instead
 * let any `this.books` accesses resolve to the getters we've installed on the prototype.
 */
export function newEntity<T extends Entity>(em: EntityManager, cstr: EntityConstructor<T>, isNew: boolean): T {
  if (!cstr.hasOwnProperty(lazySymbol)) {
    moveRelationsToGetters(cstr);
    (cstr as any)[lazySymbol] = true;
  }
  const meta = getMetadata(cstr);
  if (meta.ctiAbstract) fail(`Cannot create an instance of abstract entity ${meta.type}`);
  // This side-steps the `Author` constructor that initializes fields instance-level fields, which instead
  // we've shoved up to be getters on the prototype, and the only instance field we expect to have is `__data`,
  // which is set by the `baseEntityCstr` call.
  const entity = Object.create(cstr.prototype) as T;
  baseEntityCstr(em, entity as any, isNew);
  return entity;
}

function moveRelationsToGetters(cstr: EntityConstructor<any>): void {
  // Reuse getProperties's detect
  for (const [fieldName, value] of getLazyFields(getMetadata(cstr))) {
    if (value instanceof LazyField) {
      Object.defineProperty(cstr.prototype, fieldName, {
        get(this: any) {
          return (this.__data.relations[fieldName] ??= value.create(this, fieldName));
        },
      });
    } else if (fieldName === "transientFields") {
      Object.defineProperty(cstr.prototype, fieldName, {
        get(this: any) {
          // This prototype-level `get` will only ever be called once per instance, b/c when we're
          // called for the first/only time, we set an instance-level `this.transientFields` that, for
          // all future calls, will resolve to the instance's own copy of the fields.
          //
          // This has the pleasant upshot of making the instance-level `transientFields` lazy, and
          // they will not be created on an instance until they're actually asked for.
          const copy = structuredClone(value);
          Object.defineProperty(this, "transientFields", { value: copy });
          return copy;
        },
      });
    }
  }
}

/**
 * A function for `has...` methods to integrate with the `newEntity` lazy field system.
 *
 * We need TypeScript to still see `books = hasMany(...)` as being typed as `Many<Book>`,
 * so this method's return type is `R` i.e. the `Many<Book>` relation type.
 *
 * But at runtime we actually want this to be a `LazyField` that can be rewritten
 * into a getter, and only invoked when the relation is actually accessed.
 */
export function lazyField<T extends Entity, R>(fn: (entity: T, fieldName: string) => R): R {
  return new LazyField(fn) as R;
}

/**
 * Easily resolves `otherMetadata` fields for lazy relations.
 *
 * When `lazyRelation`s are initialized for their first/only time, i.e. the `books = hasBooks(authorMetadata)`
 * call that `getFakeInstance` does, it's when the class bodies are still being evaled, which is before the
 * `metadata.ts` file has run.
 *
 * This means that any `authorMetadata` consts would still be undefined.
 *
 * So instead we just do not bother passing metadata consts to `has...` methods, and instead let the methods
 * one-time resolve `otherMetadata` on their first invocation, which will be after the `metadata.ts` file has
 * finished importing, and the consts are all defined.
 */
export function resolveOtherMeta(entity: Entity, fieldName: string): EntityMetadata {
  const meta = getMetadata(entity);
  const field: any = meta.allFields[fieldName] ?? fail(`Could not find field ${meta.type}.${fieldName}`);
  return field.otherMetadata();
}

/** Wraps `has...` relation constructors in an easily-identifiable container. */
export class LazyField<T extends Entity> {
  #fn: (entity: T, fieldName: string) => any;
  constructor(fn: (entity: T, fieldName: string) => any) {
    this.#fn = fn;
  }

  /** Called by our getters to lazily create the relation on first access. */
  create(entity: T, fieldName: string) {
    return this.#fn(entity, fieldName);
  }
}
