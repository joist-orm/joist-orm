import { IdType } from "./Entity";
import {
  Entity,
  EntityManager,
  EntityMetadata,
  InstanceData,
  TaggedId,
  deTagId,
  getMetadata,
  keyToNumber,
} from "./index";

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

  /** The single-arg constructor is our psuedo-public API that can only be called by the EntityManager. */
  constructor(em: EntityManager);
  constructor(em: EntityManager, isNew?: boolean) {
    if (isNew === undefined) {
      throw new Error("Entities must be constructed by calling em.create or em.load");
    }
    // This code path won't be reused for real entities, as they go through the `newEntity`
    // construction process that lazifies the relations.
    baseEntityCstr(em, this, isNew);
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
    return toStringWithPrefix(meta, this, meta.type);
  }

  toTaggedString(): string {
    const meta = getMetadata(this);
    return toStringWithPrefix(meta, this, meta.tagName);
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

function toStringWithPrefix(meta: EntityMetadata, entity: Entity, prefix: string): string {
  // Start with `Author` or `a`, depending on the caller
  let result = prefix;
  // Add `#1` if this is an em.create-d entity
  const data = getInstanceData(entity);
  const createId = data.createId;
  if (createId) {
    result += `#${createId}`;
  }
  // Add the `:1` but only after our flush is complete, otherwise the id is
  // internally assigned but not really flushed/committed to the db yet
  const dbId = entity.idTaggedMaybe;
  if (data.pendingOperation !== "insert" && dbId) {
    // Strip the tag because we add back the entity prefix
    result += `:${keyToNumber(meta, dbId)}`;
  }
  return result;
}

/**
 * The constructor logic for `BaseEntity` but exposed so that `newEntity` can use it too
 * on its `Object.create`-d instances.
 */
export function baseEntityCstr(em: EntityManager, entity: BaseEntity<any, any>, isNew: boolean): void {
  const data = new InstanceData(em, (entity.constructor as any).metadata, isNew);
  // This makes it non-enumerable to avoid Jest/recursive things tripping over it
  Object.defineProperty(entity, "__data", { value: data, enumerable: false, writable: false, configurable: false });
}
