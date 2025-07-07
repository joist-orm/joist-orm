import { IdType } from "./Entity";
import {
  Entity,
  EntityManager,
  InstanceData,
  TaggedId,
  deTagId,
  getEmInternalApi,
  getMetadata,
  keyToNumber,
} from "./index";

export let currentlyInstantiatingEntity: Entity | undefined;

/** Used by our `joist-transform-properties` to lazy init properties and by sync defaults to reset if an entity is
 * created as a default. */
export function setCurrentlyInstantiatingEntity(entity: Entity): void {
  currentlyInstantiatingEntity = entity;
}

/**
 * Returns the internal `__data` tracking field for `entity`.
 *
 * This should be treated as an internal API and may change without notice.
 */
export function getInstanceData(entity: Entity): InstanceData {
  return BaseEntity.getInstanceData(entity);
}

/**
 * The base class for all entities.
 *
 * Currently, this just adds the `.load(lensFn)` method for declarative reference traversal.
 */
export abstract class BaseEntity<EM extends EntityManager, I extends IdType = IdType> implements Entity {
  public static getInstanceData(entity: Entity): InstanceData {
    return (entity as BaseEntity<any>).__data;
  }
  // We use a protected field so that subclass getters can easily access `this.__data.relations`.
  protected readonly __data!: InstanceData;

  protected constructor(em: EM, optsOrId: any) {
    const isNew = typeof optsOrId !== "string";
    const data = new InstanceData(em, (this.constructor as any).metadata, isNew);
    // This makes it non-enumerable to avoid Jest/recursive things tripping over it
    Object.defineProperty(this, "__data", { value: data, enumerable: false, writable: false, configurable: false });
    // Only do em.register for em.create-d entities, otherwise defer to hydrate to em.register
    if (isNew) {
      em.register(this, optsOrId?.id);
      // api will be undefined during getFakeInstance
      const api = getEmInternalApi(em);
      api?.fieldLogger?.logCreate(this);
    }
    currentlyInstantiatingEntity = this;
  }

  // This gives rules a way to access the fully typed object instead of their Reacted view.
  // And we make it public so that a function that takes Reacted<...> can accept a Loaded<...>
  // that sufficiently overlaps.
  get fullNonReactiveAccess(): this {
    return this;
  }

  /** @returns the entity's id, tagged/untagged based on your config, or a runtime error if it's new/unassigned. */
  abstract id: I;

  /** @returns the entity's, tagged/untagged based on your config, or undefined if it's new/unassigned. */
  abstract get idMaybe(): I | undefined;

  /** @returns the entity's id, always tagged, or a runtime error if it's new/unassigned. */
  abstract idTagged: TaggedId;

  /** @returns the entity's id, always tagged, or undefined if it's new/unassigned. */
  abstract get idTaggedMaybe(): TaggedId | undefined;

  /** @returns the entity's id, always untagged, or a runtime error if it's unassigned. */
  get idUntagged(): string {
    return deTagId(getMetadata(this), this.id);
  }

  abstract set(opts: unknown): void;

  /**
   * Similar to `set` but applies "Partial API" semantics, i.e. `null` means unset and `undefined` means don't change.
   */
  abstract setPartial(opts: unknown): void;

  /**
   * Similar to `set` but applies "Partial API" semantics, i.e. `null` means unset and `undefined` means don't change.
   */
  abstract setDeepPartial(opts: unknown): Promise<void>;

  /**
   * Returns whether the entity is new.
   *
   * This is not just `this.id === undefined`, because just assigning an id doesn't mean the entity
   * is no longer new; this only flips to `false` after the `flush` transaction has been committed.
   */
  get isNewEntity(): boolean {
    return this.__data.isNewEntity;
  }

  get isDeletedEntity(): boolean {
    return this.__data.isDeletedEntity;
  }

  get isDirtyEntity(): boolean {
    return this.__data.isDirtyEntity;
  }

  toString(): string {
    const meta = getMetadata(this);
    // Even if we've been `em.assignNewIds`-d before an `em.flush`, also have new entities
    // return the `Author#1` syntax because it's really helpful for debugging to see what's new.
    if (this.isNewEntity || this.idMaybe === undefined) {
      const sameType = this.em.getEntities(meta.cstr).filter((e) => e.isNewEntity);
      // Returns `Author#1` as a hint that it's a test id and not the real id
      return `${meta.type}#${sameType.indexOf(this) + 1}`;
    } else {
      // Strip the tag because we add back the entity prefix
      const id = keyToNumber(meta, this.id) || "new";
      // Returns `Author:1` instead of `author:1` to differentiate the instance's toString from the tagged id itself
      return `${meta.type}:${id}`;
    }
  }

  toTaggedString(): string {
    if (this.idMaybe) {
      return this.idTagged;
    }
    const meta = getMetadata(this);
    const sameType = this.em.getEntities(meta.cstr).filter((e) => e.isNewEntity);
    return `${meta.tagName}#${sameType.indexOf(this) + 1}`;
  }

  public get em(): EM {
    return this.__data.em as EM;
  }

  /**
   * A very simple toJSON that just returns the id.
   *
   * This is for security reasons, to avoid accidentally logging sensitive data; you
   * can specify more fields, and potentially nested return data, by using passing
   * a {@link JsonHint} to `toJSON`.
   */
  public toJSON(): object {
    return { id: this.idMaybe || null };
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
