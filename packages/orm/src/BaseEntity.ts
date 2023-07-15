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
 * Currently, this just adds the `.load(lensFn)` method for declarative reference traversal.
 */
export abstract class BaseEntity<EM extends EntityManager = EntityManager> implements Entity {
  abstract id: string | undefined;
  abstract idTagged: string | undefined;
  readonly __orm!: EntityOrmField;
  // This gives rules a way to access the fully typed object instead of their Reacted view.
  // And we make it public so that a function that takes Reacted<...> can accept a Loaded<...>
  // that sufficiently overlaps.
  readonly entity!: this;

  protected constructor(em: EntityManager, metadata: any, defaultValues: object, opts: any) {
    Object.defineProperty(this, "__orm", {
      value: new EntityOrmField(em, metadata, defaultValues),
      enumerable: false,
    });
    Object.defineProperty(this, "entity", {
      value: this,
      enumerable: false,
      writable: false,
    });
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
  abstract get idTaggedOrFail(): string;

  /**
   * Returns whether the entity is new.
   *
   * This is not just `this.id === undefined`, because just assigning an id doesn't mean the entity
   * is no longer new; this only flips to `false` after the `flush` transaction has been committed.
   */
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
    if (this.id) {
      // Strip the tag because we add back the entity prefix
      const id = keyToNumber(meta, this.id) || "new";
      // Returns `Author:1` instead of `author:1` to differentiate the instance's toString from the tagged id itself
      return `${meta.type}:${id}`;
    } else {
      const sameType = this.em.entities.filter((e) => e instanceof meta.cstr);
      // Returns `Author#1` as a hint that it's a test id and not the real id
      return `${meta.type}#${sameType.indexOf(this) + 1}`;
    }
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
   *
   * That said, we do happen match Prisma's wire format to ease migration.
   */
  public toJSON(): object {
    return Object.fromEntries(
      Object.values(getMetadata(this).fields)
        .map((f) => {
          switch (f.kind) {
            case "primaryKey":
            case "enum":
              return [[f.fieldName, (this as any)[f.fieldName] || null]];
            case "primitive":
              if (f.derived === "async") {
                // Use the raw value instead of the PersistedAsyncProperty
                return [[f.fieldName, (this as any).__orm.data[f.fieldName] || null]];
              } else {
                return [[f.fieldName, (this as any)[f.fieldName] || null]];
              }
            case "m2o":
              // Don't recurse into new entities b/c the point is to stay shallow
              const value = (this as any)[f.fieldName].current();
              return [[f.fieldName, isEntity(value) ? value.id : value || null]];
            default:
              return [];
          }
        })
        .flat(1),
    );
  }

  [Symbol.toStringTag](): string {
    return this.toString();
  }

  /**
   * Hooks into node's `console.log` to avoid sprawling output of our relations/internal state.
   *
   * See https://nodejs.org/api/util.html#custom-inspection-functions-on-objects.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}
