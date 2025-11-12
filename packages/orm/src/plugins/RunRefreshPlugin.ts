import { getMetadataForType } from "../configure";
import { loadDataLoader } from "../dataloaders/loadDataLoader";
import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi, isDefined } from "../EntityManager";
import { Plugin } from "../PluginManager";
import { ManyToManyCollection } from "../relations";
import { JoinRowTodo, Todo } from "../Todo";
import { getOrSet } from "../utils";

export class RunRefreshPlugin extends Plugin {
  #entities = {} as Record<string, Set<Entity>>;
  #joins = {} as Record<string, Set<Entity>>;

  beforeWrite(entityTodos: Record<string, Todo>, joinRowTodos: Record<string, JoinRowTodo>) {
    Object.entries(entityTodos).forEach(([type, todo]) => {
      const entities = getOrSet(this.#entities, type, new Set());
      [todo.inserts, todo.updates, todo.deletes].forEach((todoEntities) =>
        todoEntities.forEach((e) => entities.add(e)),
      );
    });
    Object.entries(joinRowTodos).forEach(([joinTable, todo]) => {
      const entities = getOrSet(this.#joins, joinTable, new Set());
      [todo.deletedRows, todo.newRows].forEach((joinRows) =>
        joinRows.forEach((joinRow) => Object.values(joinRow.columns).forEach((e) => entities.add(e))),
      );
    });
  }

  async refresh(em: EntityManager) {
    if (Object.entries(this.#entities).length === 0 && Object.entries(this.#joins).length === 0) return;
    const api = getEmInternalApi(em);
    api.setIsRefreshing(true);
    api.clearDataloaders();
    api.clearPreloadedRelations();

    await Promise.all([
      ...Object.entries(this.#entities).flatMap(([type, entities]) => {
        const meta = getMetadataForType(type);
        return entities.values().map((e) => loadDataLoader(em, meta, true).load({ entity: e.idTagged, hint: [] }));
      }),
      ...Object.entries(this.#joins).flatMap(([joinTable, entities]) => {
        let relations: string[];
        return entities
          .values()
          .map((e) => em.findExistingInstance(e.idTagged))
          .filter(isDefined)
          .flatMap((e) => {
            if (!relations) {
              relations = [];
            }
            return relations
              .values()
              .map((relation) =>
                relation in e ? ((e as any)[relation] as ManyToManyCollection<any, any>).load() : undefined,
              )
              .filter(isDefined);
          });
      }),
    ]);

    api.setIsRefreshing(false);
  }
}
