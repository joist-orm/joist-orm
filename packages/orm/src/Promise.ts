import { Entity, Loaded, LoadHint } from "./EntityManager";
import { getEm } from "./index";

export {};

declare global {
  interface Promise<T> {
    populate<T extends Entity, H extends LoadHint<T>>(this: Promise<T>, hint: H): Promise<Loaded<T, H>>;
    populate<T extends Entity, H extends LoadHint<T>>(
      this: Promise<readonly T[]>,
      hint: H,
    ): Promise<readonly Loaded<T, H>[]>;
    populate<T extends Entity, H extends LoadHint<T>>(this: Promise<T[]>, hint: H): Promise<Loaded<T, H>[]>;
    populate<T extends Entity, H extends LoadHint<T>>(
      this: Promise<T | undefined>,
      hint: H,
    ): Promise<Loaded<T, H> | undefined>;
  }
}

Promise.prototype.populate = function <T extends Entity, H extends LoadHint<T>>(
  this: Promise<T> | Promise<readonly T[]> | Promise<T[]> | Promise<T | undefined>,
  hint: H,
): Promise<any> {
  return this.then((result: T | readonly T[] | T[] | undefined) => {
    if (result === undefined) {
      return undefined as any;
    } else if (Array.isArray(result) && result.length === 0) {
      return [] as any;
    } else if (Array.isArray(result)) {
      const em = getEm(result[0]);
      return em.populate(result as readonly T[], hint) as any;
    } else {
      const em = getEm(result as T);
      return em.populate(result as T, hint) as any;
    }
  });
};
