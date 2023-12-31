import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { getField } from "../fields";
import {
  abbreviation,
  addTablePerClassJoinsAndClassTag,
  assertIdsAreTagged,
  deTagIds,
  maybeResolveReferenceToId,
  ParsedFindQuery,
} from "../index";
import { OneToOneReferenceImpl } from "../relations/OneToOneReference";
import { groupBy } from "../utils";

export function oneToOneDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  reference: OneToOneReferenceImpl<T, U>,
): DataLoader<string, U | undefined> {
  // The metadata for the entity that contains the reference
  const meta = getMetadata(reference.entity);
  const batchKey = `${meta.tableName}-${reference.fieldName}`;
  return em.getLoader("o2o-load", batchKey, async (_keys) => {
    const { otherMeta, otherFieldName } = reference;

    assertIdsAreTagged(_keys);
    const keys = deTagIds(meta, _keys);

    const { em } = reference.entity;

    const alias = abbreviation(otherMeta.tableName);
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [{ alias, join: "primary", table: otherMeta.tableName }],
      condition: {
        op: "and",
        conditions: [
          { alias, column: reference.otherColumnName, dbType: meta.idDbType, cond: { kind: "in", value: keys } },
        ],
      },
      orderBys: [],
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rows = await em.driver.executeFind(em, query, {});

    const entities = em.hydrate(otherMeta.cstr, rows, { overwriteExisting: false });

    const entitiesByOtherId = groupBy(entities, (entity) => {
      // TODO If this came from the UoW, it may not be an id? I.e. pre-insert.
      const ownerId = maybeResolveReferenceToId(getField(entity, otherFieldName));
      // We almost always expect ownerId to be found, b/c normally we just hydrated this entity
      // directly from a SQL row with owner_id=X, however we might be loading this reference
      // (i.e. find all children where owner_id=X) when the SQL thinks a child is still pointing
      // at the parent (i.e. owner_id=X in the db), but our already-loaded child has had its
      // `child.owner` field either changed to some other owner, or set to undefined. In either,
      // that child should no longer be parent of this owner's collection, so just return a
      // dummy value.
      return ownerId ?? "dummyNoLongerOwned";
    });
    return _keys.map((k) => entitiesByOtherId.get(k)?.[0] as U | undefined);
  });
}
