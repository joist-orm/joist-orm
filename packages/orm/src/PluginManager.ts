import { Entity } from "./Entity";
import { EntityManager, FindOperation } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { ParsedFindQuery } from "./QueryParser";
import { fail } from "./utils";

interface PluginMethods {
  beforeSetField?(entity: Entity, field: string, newValue: any): void;
  beforeFind?(
    meta: EntityMetadata,
    operation: FindOperation,
    query: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): void;
  afterFind?(meta: EntityMetadata, operation: FindOperation, rows: any[]): void;
}

const pluginMethods = ["beforeSetField", "beforeFind", "afterFind"] as (keyof PluginMethods)[];

const emSymbol = Symbol("em");
export abstract class Plugin {
  private [emSymbol]: EntityManager | undefined;

  get em(): EntityManager {
    return this[emSymbol]!;
  }
}

export interface Plugin extends PluginMethods {}

export class PluginManager {
  readonly plugins: Plugin[] = [];
  readonly #pluginsByCallback: Partial<Record<keyof Plugin, Plugin[]>> = {};
  constructor(public readonly em: EntityManager) {}

  addPlugin(plugin: Plugin) {
    if (plugin[emSymbol] !== undefined) fail("Cannot add plugin to multiple entity managers");
    plugin[emSymbol] = this.em;
    this.plugins.push(plugin);

    for (const method of pluginMethods) {
      if (method in plugin) {
        (this.#pluginsByCallback[method] ??= []).push(plugin);
        // As a performance optimization, we only create the method on the plugin manager once we have at least one
        // plugin using that method. This is to make it so any unused plugin methods are effectively no-ops when called
        // from within the em.
        this[method] ??= function (this: PluginManager, ...args: any[]) {
          for (const plugin of this.#pluginsByCallback[method]!) {
            (plugin[method] as (...args: any[]) => unknown)(...args);
          }
        };
      }
    }
  }
}

export interface PluginManager extends PluginMethods {}
