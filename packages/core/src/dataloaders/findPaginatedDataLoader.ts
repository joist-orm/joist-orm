import {
  collectAndReplaceArgs,
  collectValues,
  createColumnValuesFromPrepared,
  filterDeletedEntities,
  findOperation,
  getBatchKeyFromGenericStructure,
  queryFilterHash,
} from "src/dataloaders/findDataLoader.ts";
import type { Entity } from "src/Entity.ts";
import { type EntityManager, type MaybeAbstractEntityConstructor, getEmInternalApi } from "src/EntityManager.ts";
import { getMetadata } from "src/EntityMetadata.ts";
import { buildHintTree } from "src/loading/HintTree.ts";
import type { LoadHint } from "src/loading/loadHints.ts";
import { hintKey } from "src/normalizeHints.ts";
import type { FilterAndSettings } from "src/queries/find/EntityFilter.ts";
import { type ParsedFindQuery, parseFindQuery } from "src/queries/find/QueryParser.ts";
import { isQueryProvablyEmpty } from "src/queries/find/QueryVisitor.ts";
import { buildUnnestCte } from "src/queries/unnest.ts";

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
  if (isQueryProvablyEmpty(query)) return Promise.resolve([]);

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
    hintKey(hint),
    findSettings.limit,
    findSettings.offset,
  ].join("-");

  return em
    .getLoader<PreparedPaginatedFindEntry<T>, T[]>(
      findOperation,
      batchKey,
      async (entries) => {
        if (entries.length === 1) {
          // Skip batching & just execute the query as-is
          const { query, findSettings } = entries[0];
          const { preloader } = getEmInternalApi(em);
          const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);
          const rowData = await em["executePreparedFindRowData"](meta, findOperation, query, findSettings, false);
          const entities = em["hydrateAndFinalize"](type, rowData, {
            sidecars: (entities) => preloadHydrator?.(rowData, entities),
          });
          return [filterDeletedEntities(em, entities)];
        }

        const { query, findSettings, limit, offset } = entries[0];
        const { preloader } = getEmInternalApi(em);
        const preloadHydrator = preloader && hint && preloader.addPreloading(meta, buildHintTree(hint), query);

        // Now craft the actual batched query
        const args = collectAndReplaceArgs(query, entries);
        const argsColumns = [{ columnName: "tag", dbType: "int" }, ...args.map((a) => a.column)];
        const columnValues = createColumnValuesFromPrepared(args, entries);
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

        const rowData = await em["executePreparedFindRowData"](
          meta,
          findOperation,
          query2,
          { ...findSettings, limit: undefined, offset: undefined },
          false,
        );
        const results = entries.map(() => [] as T[]);
        em["hydrateAndFinalize"](type, rowData, {
          sidecars: (entities) => {
            preloadHydrator?.(rowData, entities);
            // Read tags before compaction drops rows already present in the identity map.
            for (let i = 0; i < entities.length; i++) {
              const entity = entities[i];
              if (!entity.isDeletedEntity) {
                results[rowData.get(i, "tag")].push(entity);
              }
            }
          },
        });
        return results;
      },
      { cacheKeyFn: queryFilterHash },
    )
    .load(prepared);
}
