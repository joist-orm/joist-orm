import { Entity, EntityOrmField } from "./EntityManager";
import { Reference } from "./index";

/**
 * A type for declaratively walking the object graph.
 *
 * This is not technically a Lens that can `get/set`, but the idea is generally the same.
 */
export type Lens<T extends Entity> = {
  [P in keyof T]: T[P] extends Reference<T, infer U, infer N> ? Lens<U> : never;
};

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
  async load<R extends Entity>(fn: (lens: Lens<this>) => Lens<R>): Promise<R> {
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
      current = await current[path].load();
    }
    return current!;
  }
}
