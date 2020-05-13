import { Entity, EntityManager, EntityOrmField, IdOf, OptsOf } from "./EntityManager";
import { Collection, fail, PartialOrNull, Reference } from "./index";

/**
 * A type for declaratively walking the object graph.
 *
 * This is not technically a Lens that can `get/set`, but the idea is generally the same.
 */
export type Lens<T extends Entity, R extends T | T[] = T> = {
  [P in LenKeys<T>]: T[P] extends Reference<T, infer U, infer N> // See if R is a T[], which means even if this is a `.parent`-singular reference, upstream // in the lens we've gone through a collection, so will be returning multiple `parent`s.
    ? Lens<U, R extends Array<T> ? U[] : U>
    : T[P] extends Collection<T, infer U>
    ? Lens<U, U[]>
    : never;
};

type LenKeys<T extends Entity> = {
  [P in keyof T]: T[P] extends Reference<T, any, any> ? P : T[P] extends Collection<T, any> ? P : never;
}[keyof T];

/**
 * The base class for all entities.
 *
 * Currently this just adds the `.load(lensFn)` method for declarative reference traversal.
 */
export abstract class BaseEntity implements Entity {
  abstract id: string | undefined;
  readonly __orm: EntityOrmField;

  protected constructor(em: EntityManager, metadata: any) {
    this.__orm = { em, metadata, data: {}, originalData: {} };
    em.register(this);
  }

  /**
   * Allows declaratively loading/traversing several layers of references at once.
   *
   * I.e.:
   *
   * ```typescript
   * const publisher = await book.load(b => b.author.publisher);
   * ```
   */
  // For some reason accepting Lens<this, this> does not work when called from within the entity
  // subclass itself, so we use the codegen hammer in our subclass to force the right Lens type
  // in a .load stub that just calls us for the implementation.
  async load<U extends Entity, V extends U | U[]>(fn: (lens: Lens<any, any>) => Lens<U, V>): Promise<V> {
    const paths: string[] = [];
    // The proxy collects the path navigations that the `fn` does.
    const proxy = new Proxy(
      {},
      {
        get(object, property, receiver) {
          paths.push(String(property));
          return receiver;
        },
      },
    ) as any;
    fn(proxy as any);
    let current: any = this;
    for await (const path of paths) {
      if (Array.isArray(current)) {
        current = (await Promise.all(current.map((c) => c[path].load()))).flat();
        current = [...new Set(current)];
      } else {
        current = await current[path].load();
      }
    }
    return current!;
  }

  abstract set(values: Partial<OptsOf<this>>): void;

  abstract setUnsafe(values: PartialOrNull<OptsOf<this>>): void;

  /** @returns the current entity id or a runtime error if it's unassigned, i.e. it's not been assigned from the db yet. */
  get idOrFail(): IdOf<this> {
    return this.__orm.data["id"] || fail("Entity has no id yet");
  }

  toString(): string {
    return `${this.__orm.metadata.type}#${this.id}`;
  }

  [Symbol.toStringTag](): string {
    return this.toString();
  }
}

