import { Entity } from "./Entity";
import { EntityManager } from "./EntityManager";

export abstract class Plugin {
  #em: EntityManager | undefined;

  get em(): EntityManager {
    return this.#em!;
  }

  set em(em: EntityManager) {
    if (this.#em) fail("Plugin already has an EntityManager");
    this.#em = em;
  }
}

export interface Plugin {
  beforeSetField?(entity: Entity, field: string, newValue: any): void;
}

const pluginMethods = ["beforeSetField", "afterSetField"] as (keyof Plugin)[];

export class PluginManager {
  readonly plugins: Plugin[] = [];
  private readonly pluginsByCallback: Partial<Record<keyof Plugin, Plugin[]>> = {};
  constructor(public readonly em: EntityManager) {}

  addPlugin(plugin: Plugin) {
    plugin.em = this.em;
    this.plugins.push(plugin);
    for (const method of pluginMethods) {
      if (method in plugin) {
        (this.pluginsByCallback[method] ??= []).push(plugin);
      }
    }
  }

  beforeSetField(entity: Entity, field: string, newValue: any) {
    for (const plugin of this.getPluginsForCallback("beforeSetField")) {
      plugin.beforeSetField?.(entity, field, newValue);
    }
  }

  private getPluginsForCallback(callback: keyof Plugin) {
    return this.pluginsByCallback[callback] ?? [];
  }
}
