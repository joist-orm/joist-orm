import DataLoader from "dataloader";
import { AliasAssigner } from "../AliasAssigner";
import { Entity } from "../Entity";
import { EntityManager, MaybeAbstractEntityConstructor, TaggedId } from "../EntityManager";
import { EntityMetadata, ManyToOneField, OneToManyField, OneToOneField, getMetadata } from "../EntityMetadata";
import {
  ColumnCondition,
  ParsedFindQuery,
  ParsedOrderBy,
  ParsedTable,
  addTablePerClassJoinsAndClassTag,
  maybeAddOrderBy,
} from "../QueryParser";
import { deTagIds, tagId } from "../keys";
import { mapPathsToTarget } from "../loadLens";
import { groupBy } from "../utils";

/**
 * Loads lens paths via SQL.
 *
 * I.e. instead of loading `author.load(a => a.books.reviews)` by pulling all
 * Books into memory, we do a join from the Author to BookReviews.
 */
export function lensDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  startIsArray: boolean,
  paths: string[],
): DataLoader<TaggedId, T | T[]> {
  // Batch lens loads by type + path to avoid N+1s
  const batchKey = `${type.name}-${paths.join("/")}`;
  return em.getLoader("lens", batchKey, async (sourceIds) => {
    const { getAlias } = new AliasAssigner();

    // br.load(br => br.book.author)
    // select br.id as __source_id, a.*
    // from authors a
    // join books b ON b.author_id = a.id
    // join book_reviews br ON br.book_id = br.id
    // where br.id in (keys)
    // source=BR, target=Author, fields=books,bookReviews

    // a.load(a => a.books.reviews)
    // select b.author_id as __source_id, br.*
    // from book_reviews br
    // join books b on b.id = br.book_id
    // where b.author_id in (keys)

    const source = getMetadata(type);
    // Walk source -> paths -> the target, and return the target -> source fields
    const [target, fields] = mapPathsToTarget(source, paths);
    let resultIsArray = startIsArray;

    const alias = getAlias(target.tableName);
    const selects = [`"${alias}".*`];
    const tables: ParsedTable[] = [{ alias, join: "primary", table: target.tableName }];
    const conditions: ColumnCondition[] = [];
    const orderBys: ParsedOrderBy[] = [];
    const query: ParsedFindQuery = { selects, tables, condition: { op: "and", conditions }, orderBys };
    addTablePerClassJoinsAndClassTag(query, target, alias, true);
    maybeAddOrderBy(query, target, alias);

    function maybeAddNotSoftDeleted(other: EntityMetadata, alias: string): void {
      if (other.timestampFields.deletedAt) {
        const column = other.allFields[other.timestampFields.deletedAt].serde?.columns[0]!;
        conditions.push({
          alias,
          column: column.columnName,
          dbType: column.dbType,
          cond: { kind: "is-null" },
        });
      }
    }

    let lastAlias = alias;
    fields.forEach(([, field], i) => {
      const isLast = i === fields.length - 1;
      switch (field.kind) {
        case "o2o":
        case "o2m": {
          // This is `Publisher.authors` and we want to join in the authors table,
          // so get the `Author.publisher` field to know the column name
          const other = field.otherMetadata();
          const m2o = other.allFields[field.otherFieldName] as ManyToOneField;
          const alias = getAlias(other.tableName);
          tables.push({
            alias,
            join: "inner",
            table: other.tableName,
            col1: `${alias}.${m2o.serde.columns[0].columnName}`,
            col2: `${lastAlias}.id`,
          });
          maybeAddNotSoftDeleted(other, alias);
          if (isLast) {
            selects.push(`"${alias}".id as __source_id`);
            conditions.push({
              alias,
              column: "id",
              dbType: other.idDbType,
              cond: { kind: "in", value: deTagIds(source, sourceIds) },
            });
          }
          lastAlias = alias;
          break;
        }
        case "m2o": {
          // This is `Book.author` and we want to join in the authors table
          const other = field.otherMetadata();
          const otherField = other.fields[field.otherFieldName] as OneToManyField | OneToOneField;
          const alias = getAlias(other.tableName);
          if (!isLast) {
            tables.push({
              alias,
              join: "inner",
              table: other.tableName,
              col1: `${alias}.id`,
              col2: `${lastAlias}.${field.serde.columns[0].columnName}`,
            });
            maybeAddNotSoftDeleted(other, alias);
          } else {
            selects.push(`"${lastAlias}".${field.serde.columns[0].columnName} as __source_id`);
            conditions.push({
              alias: lastAlias,
              column: field.serde.columns[0].columnName,
              dbType: field.serde.columns[0].dbType,
              cond: { kind: "in", value: deTagIds(source, sourceIds) },
            });
            // Need to add filter for soft-deleted...
          }
          resultIsArray = otherField.kind === "o2o" ? resultIsArray : true;
          lastAlias = alias;
          break;
        }
        case "m2m": {
          // This is `Book.tags` and we want to join through the m2m table
          const other = field.otherMetadata();
          const alias = getAlias(other.tableName);
          tables.push({
            alias: `${alias}_m2m`,
            join: "inner",
            table: field.joinTableName,
            col1: `${alias}_m2m.${field.columnNames[0]}`,
            col2: `${lastAlias}.id`,
          });
          // If this is the last table, we could skip this join like we do for m2os
          tables.push({
            alias,
            join: "inner",
            table: other.tableName,
            col1: `${alias}.id`,
            col2: `${alias}_m2m.${field.columnNames[1]}`,
          });
          maybeAddNotSoftDeleted(other, alias);
          if (isLast) {
            selects.push(`"${alias}".id as __source_id`);
            conditions.push({
              alias,
              column: "id",
              dbType: other.idDbType,
              cond: { kind: "in", value: deTagIds(source, sourceIds) },
            });
          }
          resultIsArray = true;
          lastAlias = alias;
          break;
        }
        default:
          throw new Error("Unsupported field kind: " + field.kind);
      }
    });

    // Get back `__source_id, target.*`
    const rows = await em.driver.executeFind(em, query, {});

    // Group the target entities (i.e. BookReview) by the source id we reached them from.
    const entitiesBySourceId = new Map(
      [...groupBy(rows, (row) => row["__source_id"]).entries()].map(([sourceId, rows]) => {
        // We may technically re-hydrate the same entity twice if it was reached
        // via multiple sources, but that should be fine/get deduped by hydrate.
        return [tagId(source, sourceId), em.hydrate(target.cstr, rows)];
      }),
    );

    // Re-order the output by the batched input
    return sourceIds.map((id) => {
      const result = entitiesBySourceId.get(id);
      return resultIsArray ? [...new Set(result ?? [])] : result?.[0];
    });
  });
}
