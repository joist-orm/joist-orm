import { type Entity } from "../Entity.ts";
import { type EntityManager, getEmInternalApi } from "../EntityManager.ts";
import { type OneToOneField, getMetadata } from "../EntityMetadata.ts";
import { getField } from "../fields.ts";
import {
  type ParsedFindQuery,
  addTablePerClassJoinsAndClassTag,
  assertIdsAreTagged,
  deTagIds,
  maybeResolveReferenceToId,
} from "../index.ts";
import { type OneToOneReferenceImpl } from "../relations/OneToOneReference.ts";
import { abbreviation, groupBy } from "../utils.ts";
import { type BatchLoader } from "./BatchLoader.ts";

export const oneToOneLoadOperation = "o2o-load";

export function oneToOneBatchLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  reference: OneToOneReferenceImpl<T, U>,
): BatchLoader<string> {
  const meta = getMetadata(reference.entity);
  const batchKey = `${meta.tableName}-${reference.fieldName}`;
  return em.getBatchLoader(oneToOneLoadOperation, batchKey, async (_keys) => {
    const { otherMeta, otherFieldName } = reference;

    assertIdsAreTagged(_keys);
    const keys = deTagIds(meta, _keys);

    const alias = abbreviation(otherMeta.tableName);
    const o2o = meta.allFields[reference.fieldName] as OneToOneField;
    const other = otherMeta.allFields[reference.otherFieldName];
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [{ alias, join: "primary", table: otherMeta.tableName }],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: `${alias}${other.aliasSuffix}`,
            column: o2o.otherColumnName,
            dbType: meta.idDbType,
            cond: { kind: "in", value: keys },
          },
        ],
      },
      orderBys: [],
    };
    addTablePerClassJoinsAndClassTag(query, otherMeta, alias, true);

    const rowData = await em["executeFindRowData"](otherMeta, oneToOneLoadOperation, query, {});
    const entities = em["hydrateAndFinalize"](otherMeta.cstr, rowData);

    const entitiesByOtherId = groupBy(entities, (entity) => {
      const ownerId = maybeResolveReferenceToId(getField(entity, otherFieldName));
      return ownerId ?? "dummyNoLongerOwned";
    });

    const api = getEmInternalApi(em);
    for (const key of _keys) {
      const found = entitiesByOtherId.get(key);
      api.setPreloadedRelation(key, reference.fieldName as string, found ? [found[0]] : []);
    }
  });
}
