import { Entity } from "../Entity";
import { EntityManager, getEmInternalApi } from "../EntityManager";
import { getMetadata, keyToNumber, ManyToManyLike, ParsedFindQuery } from "../index";
import { abbreviation, getOrSet } from "../utils";
import { BatchLoader } from "./BatchLoader";

export const manyToManyLoadOperation = "m2m-load";

/** Batches m2m.packages/core/src/relations/ReactiveManyToMany.tsload calls via BatchLoader. */
export function manyToManyBatchLoader(em: EntityManager, collection: ManyToManyLike): BatchLoader<string> {
  return em.getBatchLoader(manyToManyLoadOperation, collection.joinTableName, (keys) => loadBatch(collection, keys));
}

async function loadBatch<U extends Entity>(collection: ManyToManyLike, keys: string[]): Promise<void> {
  const { em } = collection.entity;

  const joinRows = getEmInternalApi(em).joinRows(collection);

  // Break out `column_id=string` keys
  const columns: Record<string, string[]> = {};
  const tuples: [string, string][] = [];
  keys.forEach((key) => {
    const [columnId, id] = key.split("=");
    getOrSet(columns, columnId, []).push(id);
    tuples.push([columnId, id]);
  });

  const alias = abbreviation(collection.joinTableName);
  const query: ParsedFindQuery = {
    selects: [`"${alias}".*`],
    tables: [{ alias, join: "primary", table: collection.joinTableName }],
    condition: {
      kind: "exp",
      op: "or",
      conditions: Object.entries(columns).map(([columnId, values]) => {
        const meta = collection.columnName == columnId ? getMetadata(collection.entity) : collection.otherMeta;
        return {
          kind: "column",
          alias,
          column: columnId,
          dbType: meta.idDbType,
          cond: { kind: "in", value: values.map((id) => keyToNumber(meta, id)!) },
        };
      }),
    },
    orderBys: [{ alias, column: "id", order: "ASC" }],
  };

  const rows = await em["executeFind"](collection.otherMeta, manyToManyLoadOperation, query, {});
  await joinRows.loadRows(tuples, rows);

  const api = getEmInternalApi(em);
  for (const [column, id] of tuples) {
    const entity = em.getEntity(id);
    if (!entity) continue;
    const others = joinRows.getOthers(column, entity) as U[];
    // Determine the field name from the column
    const fieldName = column === collection.columnName ? collection.fieldName : collection.otherFieldName;
    api.setPreloadedRelation(entity.idTagged!, fieldName, others);
  }
}
