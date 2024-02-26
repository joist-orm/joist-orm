import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { Field, getMetadata } from "../EntityMetadata";
import { abbreviation } from "../QueryBuilder";
import {
  ColumnCondition,
  ParsedFindQuery,
  addTablePerClassJoinsAndClassTag,
  maybeAddNotSoftDeleted,
} from "../QueryParser";
import { Column } from "../serde";
import { groupBy } from "../utils";

export function findByUniqueDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  field: Field,
  softDeletes: "include" | "exclude",
): DataLoader<any, unknown | undefined> {
  const batchKey = `${type.name}-${field.fieldName}-${softDeletes}`;
  return em.getLoader("find-by-unique", batchKey, async (values) => {
    const meta = getMetadata(type);
    const alias = abbreviation(meta.tableName);

    const conditions: ColumnCondition[] = [];
    const query: ParsedFindQuery = {
      selects: [`${alias}.*`],
      tables: [{ alias, join: "primary", table: meta.tableName }],
      condition: { kind: "exp", op: "and", conditions },
      orderBys: [],
    };

    addTablePerClassJoinsAndClassTag(query, meta, alias, true);
    maybeAddNotSoftDeleted(conditions, meta, alias, softDeletes);

    let column: Column;
    switch (field.kind) {
      case "primitive":
        column = field.serde.columns[0];
        conditions.push({
          kind: "column",
          alias,
          column: column.columnName,
          dbType: column.dbType,
          cond: { kind: "in", value: values.map((v) => column.mapToDb(v)) },
        });
        break;
      default:
        throw new Error(`Unsupported field ${field.fieldName}`);
    }

    const rows = await em.driver.executeFind(em, query, {});

    const rowsByValue = groupBy(rows, (row) => row[column.columnName]);

    // Re-order the output by the batched input
    return values.map((value) => {
      const result = rowsByValue.get(value) ?? [];
      return result[0];
    });
  });
}
