import DataLoader from "dataloader";
import { getMetadataForType } from "../configure";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { addTablePerClassJoinsAndClassTag, kq, ManyToManyField, ParsedFindQuery, unsafeDeTagIds } from "../index";
import { RecursiveManyToManyParentsCollectionImpl } from "../relations/RecursiveCollection";
import { abbreviation } from "../utils";

export function recursiveManyToManyParentsDataLoader<T extends Entity, U extends Entity>(
  em: EntityManager,
  collection: RecursiveManyToManyParentsCollectionImpl<T, U>,
): DataLoader<Entity, U[]> {
  let { meta, fieldName } = collection;
  // This could be called from subtypes to get relations defined on the parent. So we need to make sure we are using the
  // correct meta by walking the inheritance tree until we find the meta that actually has the root m2o field
  while (!(collection.m2mFieldName in meta.fields) && meta.baseType) meta = getMetadataForType(meta.baseType);
  const batchKey = `${meta.tableName}-${fieldName}`;
  return em.getLoader("m2m-parents-recursive", batchKey, async (children) => {
    const m2m = meta.allFields[collection.m2mFieldName] as ManyToManyField;
    const [sourceColumn, targetColumn] = m2m.columnNames;

    const alias = abbreviation(meta.tableName);
    const query: ParsedFindQuery = {
      selects: [`"${alias}".*`],
      tables: [
        { alias, join: "primary", table: meta.tableName },
        { alias: `${alias}_cte`, join: "inner", table: `${alias}_cte`, col1: `${alias}.id`, col2: `${alias}_cte.id` },
      ],
      orderBys: [{ alias, column: "id", order: "ASC" }],
      cte: {
        // b is our base case, which is the immediate parents of the children we're loading,
        // and r is the recursive case of finding their parents.
        sql: `
          WITH RECURSIVE ${alias}_cte AS (
            SELECT b.${sourceColumn} AS id
            FROM ${kq(m2m.joinTableName)} b 
            WHERE b.${targetColumn} = ANY(?)
            UNION
            SELECT r.${sourceColumn} AS id
            FROM ${kq(m2m.joinTableName)} r 
            JOIN ${alias}_cte ON r.${targetColumn} = ${alias}_cte.id
          )
        `,
        bindings: [unsafeDeTagIds(children.map((e) => e.idTagged))],
      },
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);

    const rows = await em.driver.executeFind(em, query, {});

    // Since we're preloading m2os up the tree, merely having the entities in the EM is enough
    // for the ManyToOneReferenceImpl to find them, so we don't need to map them back to the
    // keys, or push them into the preloader cache.
    em.hydrate(meta.cstr, rows);

    return children.map(() => []);
  });
}
