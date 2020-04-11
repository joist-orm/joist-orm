import { Entity, EntityOrmField } from "./EntityManager";
import { Collection, Reference } from "./index";

/**
 * A type for declaratively walking the object graph.
 *
 * This is not technically a Lens that can `get/set`, but the idea is generally the same.
 */
export type Lens<T extends Entity, R extends T | T[] = T> = {
  [P in LenKeys<T>]: T[P] extends Reference<T, infer U, infer N>
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

  abstract __orm: EntityOrmField;

  /**
   * Allows declaratively loading several layers of references at one.
   *
   * I.e.:
   *
   * ```typescript
   * const publisher = await book.load(b => b.author.publisher);
   * ```
   */
  async load<U extends Entity, V extends U | U[]>(fn: (lens: Lens<this, this>) => Lens<U, V>): Promise<V> {
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
}
