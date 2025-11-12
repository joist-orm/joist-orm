import { Entity } from "./Entity";
import { EntityManager, FindOperation } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { ParsedFindQuery } from "./QueryParser";
import { JoinRowTodo, Todo } from "./Todo";

interface PluginMethods {
  /**
   * Called before a field value is set on an entity via setField.
   *
   * @param entity The entity instance being modified
   * @param field The field name being set
   * @param newValue The new value being assigned to the field
   */
  beforeSetField?(entity: Entity, field: string, newValue: any): void;
  /**
   * Called before a find operation is executed.
   *
   * @param meta Metadata for the entity type being queried
   * @param operation The type of find operation being performed
   * @param query The parsed query conditions
   * @param settings Query settings including limit and offset
   */
  beforeFind?(
    meta: EntityMetadata,
    operation: FindOperation,
    query: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): void;
  /**
   * Called after a find operation has been executed with the raw database rows.
   *
   * @param meta Metadata for the entity type that was queried
   * @param operation The type of find operation that was performed
   * @param rows The raw database rows returned from the query
   */
  afterFind?(meta: EntityMetadata, operation: FindOperation, rows: any[]): void;

  beforeWrite(entityTodos: Record<string, Todo>, joinRowTodos: Record<string, JoinRowTodo>): void;
}

const pluginMethods = ["beforeSetField", "beforeFind", "afterFind", "beforeWrite"] as (keyof PluginMethods)[];
/**
 * Base class for plugins that hook into entity lifecycle events.
 *
 * Plugins can implement any of the PluginMethods to intercept entity operations
 * and are automatically registered with the EntityManager when added via PluginManager.
 */
export abstract class Plugin {
  get shouldCopy() {
    return true;
  }
}

export interface Plugin extends PluginMethods {}

/**
 * Manages plugin lifecycle and dispatches plugin callbacks to registered plugins.
 *
 * The PluginManager optimizes callback dispatch by only creating dispatcher methods
 * for callbacks that have at least one registered plugin, making unused plugin hooks
 * zero-cost at runtime.
 */
export class PluginManager implements Required<PluginMethods> {
  #plugins: Plugin[] = [];
  readonly #pluginsByCallback: Partial<Record<keyof Plugin, Plugin[]>> = {};
  constructor(public readonly em: EntityManager) {}

  /**
   * Registers a plugin with this EntityManager.
   *
   * Dynamically creates dispatcher methods for any plugin callbacks implemented by this plugin,
   * enabling lazy initialization of only the hooks that are actually used.
   *
   * @throws Error if the plugin is already registered with another EntityManager
   */
  addPlugin(plugin: Plugin) {
    this.#plugins.push(plugin);
    for (const method of pluginMethods) {
      if (method in plugin) {
        (this.#pluginsByCallback[method] ??= []).push(plugin);
        // As a performance optimization, we only create the actual implmentation for each method on the plugin manager
        // once we have at least one plugin using that method. This is to make it so any unused plugin methods are
        // effectively no-ops when called from within the em.
        if (!Object.hasOwn(this, method)) {
          this[method] = function (this: PluginManager, ...args: any[]) {
            for (const plugin of this.#pluginsByCallback[method]!) {
              (plugin[method] as (...args: any[]) => unknown)(...args);
            }
          };
        }
      }
    }
  }

  get plugins(): readonly Plugin[] {
    return this.#plugins;
  }

  copyTo(em: EntityManager): PluginManager {
    const pm = new PluginManager(em);
    for (const plugin of this.#plugins) {
      if (plugin.shouldCopy) pm.addPlugin(plugin);
    }
    return pm;
  }

  /** Defined as no-op functions initially instead of using optional chaining for performance reasons.  see:
   * https://adventures.nodeland.dev/archive/noop-functions-vs-optional-chaining-a-performance/ */
  beforeSetField(entity: Entity, field: string, newValue: any): void {}
  beforeFind(
    meta: EntityMetadata,
    operation: FindOperation,
    query: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): void {}
  afterFind(meta: EntityMetadata, operation: FindOperation, rows: any[]) {}
  beforeWrite(entityTodos: Record<string, Todo>, joinRowTodos: Record<string, JoinRowTodo>): void {}
}
