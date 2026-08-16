import { type Entity } from "../Entity.ts";
import { Plugin } from "../PluginManager.ts";
import { fail } from "../utils.ts";

export class ImmutableEntitiesPlugin extends Plugin {
  readonly entities: Set<Entity> = new Set();

  beforeSetField(entity: Entity, field: string, newValue: any): void {
    if (this.entities.has(entity)) {
      fail(`Cannot set field ${field} on immutable entity ${entity}`);
    }
  }

  addEntity(entity: Entity) {
    this.entities.add(entity);
  }

  removeEntity(entity: Entity) {
    this.entities.delete(entity);
  }
}
