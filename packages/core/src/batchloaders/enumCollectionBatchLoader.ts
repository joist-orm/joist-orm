import { EntityManager, getEmInternalApi } from "../EntityManager";
import { keyToNumber, ManyToManyLike, ParsedFindQuery } from "../index";
import { abbreviation } from "../utils";
import { BatchLoader } from "./BatchLoader";

export const enumCollectionLoadOperation = "enum-collection-load";

/** Batches `EnumCollection.load` calls via BatchLoader; keys are the owning entities' tagged ids. */
export function enumCollectionBatchLoader(em: EntityManager, collection: ManyToManyLike): BatchLoader<string> {
  return em.getBatchLoader(enumCollectionLoadOperation, collection.joinTableName, (keys) =>
    loadBatch(em, collection, keys),
  );
}

async function loadBatch(em: EntityManager, collection: ManyToManyLike, keys: string[]): Promise<void> {
  const { meta, columnName, otherColumnName, joinTableName, hasJoinTableId, otherEnum, fieldName } = collection;
  const joinRows = getEmInternalApi(em).joinRows(collection);

  const alias = abbreviation(joinTableName);
  const query: ParsedFindQuery = {
    selects: [`"${alias}".*`],
    tables: [{ alias, join: "primary", table: joinTableName }],
    condition: {
      kind: "exp",
      op: "and",
      conditions: [
        {
          kind: "column",
          alias,
          column: columnName,
          dbType: meta.idDbType,
          cond: { kind: "in", value: keys.map((id) => keyToNumber(meta, id)!) },
        },
      ],
    },
    // Id-less join tables have no surrogate id to order by, so order by the FK columns instead.
    orderBys: hasJoinTableId
      ? [{ alias, column: "id", order: "ASC" }]
      : [
          { alias, column: columnName, order: "ASC" },
          { alias, column: otherColumnName, order: "ASC" },
        ],
  };

  const rows = await em["executeFind"](meta, enumCollectionLoadOperation, query, { limit: undefined });
  await joinRows.loadRows(
    keys.map((id) => [columnName, id]),
    rows,
  );

  const api = getEmInternalApi(em);
  for (const id of keys) {
    const entity = em.getEntity(id);
    if (!entity) continue;
    const codes = (joinRows.getOthers(columnName, entity) as number[])
      .sort((a, b) => a - b)
      .map((enumId) => otherEnum!.findById(enumId)!.code);
    api.setPreloadedRelation(entity.idTagged!, fieldName, codes);
  }
}
