
interface EntityConstructor<T> {
  new(): T;
}

type FilterQuery<T> = any;

class EntityManager {
  find<T>(type: EntityConstructor<T>, where: FilterQuery<T>): T[] {
    return undefined as any;
  }
}
