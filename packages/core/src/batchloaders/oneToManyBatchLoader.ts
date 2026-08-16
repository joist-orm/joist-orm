import { type Entity } from "../Entity.ts";
import { type EntityManager, getEmInternalApi } from "../EntityManager.ts";
import { getField } from "../fields.ts";
import {
  type OneToManyCollection,
  type OneToManyField,
  type ParsedFindQuery,
  addTablePerClassJoinsAndClassTag,
  assertIdsAreTagged,
  deTagIds,
  maybeResolveReferenceToId,
} from "../index.ts";
import { abbreviation, groupBy } from "../utils.ts";
import { type BatchLoader } from "./BatchLoader.ts";

export const oneToManyLoadOperation = "o2m-load";

export function oneToManyBatchLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: OneToManyCollection<T, U>,
): BatchLoader<string> {
  const { meta: oneMeta, fieldName } = collection;
  const batchKey = `${oneMeta.tableName}-${fieldName}`;
  return em.getBatchLoader(oneToManyLoadOperation, batchKey, async (_keys) => {
    const { otherMeta: meta } = collection;

    assertIdsAreTagged(_keys);
    const keys = deTagIds(oneMeta, _keys);

    const alias = abbreviation(meta.tableName);
    const o2m = oneMeta.allFields[collection.fieldName] as OneToManyField;
    const other = meta.allFields[collection.otherFieldName];
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [{ alias, join: "primary", table: meta.tableName }],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: `${alias}${other.aliasSuffix}`,
            column: o2m.otherColumnName,
            dbType: meta.idDbType,
            cond: { kind: "in", value: keys },
          },
        ],
      },
      orderBys: [{ alias, column: "id", order: "ASC" }],
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rowData = await em["executeFindRowData"](meta, oneToManyLoadOperation, query, {});
    const entities = em["hydrateAndFinalize"](meta.cstr, rowData);

    const entitiesById = groupBy(entities, (entity) => {
      const ownerId = maybeResolveReferenceToId(getField(entity, collection.otherFieldName));
      return ownerId ?? "dummyNoLongerOwned";
    });

    const api = getEmInternalApi(em);
    for (const key of _keys) {
      api.setPreloadedRelation(key, fieldName, entitiesById.get(key) || []);
    }
  });
}
