import DataLoader from "dataloader";
import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityManager, MaybeAbstractEntityConstructor, getEmInternalApi } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { buildHintTree } from "../HintTree";
import { LoadHint } from "../loadHints";
import { ParsedFindQuery, parseFindQuery } from "../QueryParser";
import { buildUnnestCte } from "../unnest";
import {
  collectAndReplaceArgs,
  createColumnValues,
  getBatchKeyFromGenericStructure,
  findOperation,
  whereFilterHash,
} from "./findDataLoader";

/** Returns a dataloader that batches paginated finds by applying pagination inside each lateral subquery. */
export function findPaginatedDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
  hint: LoadHint<T> | undefined,
): DataLoader<FilterAndSettings<T>, T[]> {
  const { where, limit, offset, ...opts } = filter;
  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const batchKey = [getBatchKeyFromGenericStructure(meta, query), JSON.stringify(hint), limit, offset].join("-");

  return em.getLoader(
    findOperation,
    batchKey,
    async (queries) => {
      if (queries.length === 1) {
        // Skip batching & just execute the query as-is
        const { where, limit, offset, ...options } = queries[0];
        const query = parseFindQuery(meta, where, options);
        const { preloader } = getEmInternalApi(em);
        const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);
        const rows = await em["executeFind"](meta, findOperation, query, {
          ...options,
          limit,
          offset,
          checkLimit: false,
        });
        const entities = em.hydrate(type, rows);
        preloadHydrator?.(rows, entities);
        return [entities];
      }

      // Call prepareFind to let plugins see the pre-batched AST
      const { where, limit, offset, ...options } = queries[0];
      const query = parseFindQuery(meta, where, options);
      const { preloader } = getEmInternalApi(em);
      const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);
      const { findSettings } = em["prepareFind"](meta, findOperation, query, {
        ...options,
        limit,
        offset,
        checkLimit: false,
      });

      // Now craft the actual batched query
      const argsColumns = collectAndReplaceArgs(query);
      argsColumns.unshift({ columnName: "tag", dbType: "int" });
      const columnValues = createColumnValues(meta, argsColumns, queries, findSettings);
      const query2: ParsedFindQuery = {
        selects: ["_find.tag as tag", "_data.*"],
        tables: [
          { join: "primary", table: "_find", alias: "_find" },
          {
            join: "lateral",
            query,
            table: meta.tableName,
            alias: "_data",
            fromAlias: "_find",
            settings: { limit, offset },
          },
        ],
        ctes: [buildUnnestCte("_find", argsColumns, columnValues)],
        orderBys: [],
      };

      const rows = await em["executePreparedFind"](
        meta,
        findOperation,
        query2,
        { ...findSettings, limit: undefined, offset: undefined },
        false,
      );
      const entities = em.hydrate(type, rows);
      preloadHydrator?.(rows, entities);

      const results = queries.map(() => [] as T[]);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        results[row.tag].push(entities[i]);
        delete row.tag;
      }
      return results;
    },
    { cacheKeyFn: whereFilterHash },
  );
}
