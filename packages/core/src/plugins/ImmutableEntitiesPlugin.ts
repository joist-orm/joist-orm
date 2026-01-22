import { Entity } from "../Entity";
import { Plugin } from "../PluginManager";
import { fail } from "../utils";

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
