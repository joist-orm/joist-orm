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
  collectValues,
  createColumnValuesFromPrepared,
  getBatchKeyFromGenericStructure,
  findOperation,
  whereFilterHash,
} from "./findDataLoader";

interface PreparedPaginatedFindEntry<T extends Entity> {
  filter: FilterAndSettings<T>;
  query: ParsedFindQuery;
  bindings: any[];
  findSettings: any;
  limit: number | undefined;
  offset: number | undefined;
}

/** Returns a dataloader that batches paginated finds by applying pagination inside each lateral subquery. */
export function findPaginatedDataLoader<T extends Entity>(
  em: EntityManager,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T>,
  hint: LoadHint<T> | undefined,
): Promise<T[]> {
  const { where, limit, offset, ...opts } = filter;
  const meta = getMetadata(type);
  const query = parseFindQuery(meta, where, opts);
  const { findSettings } = em["prepareFind"](meta, findOperation, query, { ...opts, limit, offset, checkLimit: false });
  const bindings: any[] = [];
  collectValues(bindings, query);
  const prepared = {
    filter,
    query,
    bindings,
    findSettings,
    limit: findSettings.limit,
    offset: findSettings.offset,
  };
  const batchKey = [
    getBatchKeyFromGenericStructure(meta, query),
    JSON.stringify(hint),
    findSettings.limit,
    findSettings.offset,
  ].join("-");

  return em.getLoader<PreparedPaginatedFindEntry<T>, T[]>(
    findOperation,
    batchKey,
    async (entries) => {
      if (entries.length === 1) {
        // Skip batching & just execute the query as-is
        const { query, findSettings } = entries[0];
        const { preloader } = getEmInternalApi(em);
        const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);
        const rows = await em["executePreparedFind"](meta, findOperation, query, findSettings, false);
        const entities = em.hydrate(type, rows);
        preloadHydrator?.(rows, entities);
        return [entities];
      }

      const { query, findSettings, limit, offset } = entries[0];
      const { preloader } = getEmInternalApi(em);
      const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);

      // Now craft the actual batched query
      const argsColumns = collectAndReplaceArgs(query);
      argsColumns.unshift({ columnName: "tag", dbType: "int" });
      const columnValues = createColumnValuesFromPrepared(argsColumns, entries);
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

      const results = entries.map(() => [] as T[]);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        results[row.tag].push(entities[i]);
        delete row.tag;
      }
      return results;
    },
    { cacheKeyFn: (entry) => whereFilterHash(entry.filter) },
  ).load(prepared);
}
