import {
  deTagIds,
  Entity,
  EntityManager,
  EntityOrmField,
  fail,
  getMetadata,
  isEntity,
  keyToNumber,
  OptsOf,
  PartialOrNull,
} from "./index";

/**
 * The base class for all entities.
 *
 * Currently this just adds the `.load(lensFn)` method for declarative reference traversal.
 */
export abstract class BaseEntity<EM extends EntityManager = EntityManager> implements Entity {
  abstract id: string | undefined;
  readonly __orm: EntityOrmField;

  protected constructor(em: EntityManager, metadata: any, defaultValues: object, opts: any) {
    this.__orm = { em, metadata, data: { ...defaultValues }, originalData: {}, isNew: true, isTouched: false };
    // Ensure we have at least id set so the `EntityManager.register` works
    if (typeof opts === "string") {
      this.__orm.data["id"] = opts;
      this.__orm.isNew = false;
    }
    em.register(metadata, this);
  }

  get idUntagged(): string | undefined {
    if (this.id) {
      return deTagIds(getMetadata(this), [this.id])[0];
    }
    return undefined;
  }

  get idUntaggedOrFail(): string {
    return this.idUntagged || fail("Entity has no id yet");
  }

  abstract set(values: Partial<OptsOf<Entity>>): void;

  /**
   * Similar to `set` but applies "Partial API" semantics, i.e. `null` means unset and `undefined` means don't change.
   */
  abstract setPartial(values: PartialOrNull<OptsOf<Entity>>): void;

  /** @returns the current entity id or a runtime error if it's unassigned, i.e. it's not been assigned from the db yet. */
  abstract get idOrFail(): string;

  get isNewEntity(): boolean {
    return this.__orm.isNew;
  }

  get isDeletedEntity(): boolean {
    return this.__orm.deleted !== undefined;
  }

  get isDirtyEntity(): boolean {
    return Object.keys(this.__orm.originalData).length > 0;
  }

  get isPendingFlush(): boolean {
    return this.isNewEntity || this.isDirtyEntity || this.isPendingDelete || this.__orm.isTouched;
  }

  get isPendingDelete(): boolean {
    return this.__orm.deleted === "pending";
  }

  toString(): string {
    const meta = getMetadata(this);
    // Strip the tag because we add back the entity prefix
    const id = keyToNumber(meta, this.id) || "new";
    // Returns `Author:1` instead of `author:1` to differentiate the instance's toString from the tagged id itself
    return `${meta.type}:${id}`;
  }

  public get em(): EM {
    return this.__orm.em as EM;
  }

  /**
   * A very simple toJSON.
   *
   * This is not really meant as something you would actually put on the
   * wire as an API response, but instead is to keep accidental/debugging
   * JSON-ification of an Entity (i.e. by a logger like pino) to not
   * recurse into all of our References/Collections/EntityManager/etc.
   *  */
  public toJSON(): object {
    return Object.fromEntries(
      Object.entries(this.__orm.data).map(([key, value]) => {
        // Don't recurse into new entities b/c the point is to stay shallow
        return [key, isEntity(value) ? value.toString() : value];
      }),
    );
  }

  [Symbol.toStringTag](): string {
    return this.toString();
  }
}
