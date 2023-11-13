/** A base class for relations & non-relation (i.e. `PersistedAsyncProperty) properties. */
export abstract class AbstractPropertyImpl<T> {
  #entity: T;

  constructor(entity: T) {
    this.#entity = entity;
  }

  get entity(): T {
    return this.#entity;
  }
}
