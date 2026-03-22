import { Entity, FilterAndSettings, getMetadata, MaybeAbstractEntityConstructor, parseFindQuery } from "joist-core";
import { knex as baseCreateKnex, Knex } from "knex";
import pg from "pg";
import { buildKnexQuery } from "./buildKnexQuery";

/**
 * Builds the Knex queries from `em.find`-style parameters.
 *
 * This is useful for the "last 5%" of SQL queries that require SQL features that `em.find`
 * itself doesn't support, i.e. primarily aggregation, but also complicated joins. etc.
 *
 * You can also `buildQuery` to get the regular `em.find` niceties around great join syntax,
 * join pruning, inline conditions, etc., but then take the `QueryBuilder` that it produces
 * and "muck with it". I.e. add different order bys, group bys, etc.
 *
 * The Knex API is actually well-suited for this, as it provides structure-aware methods like
 * `clearOrder`, `clearSelect`, etc. that mean you can munge the initial query without any
 * complicated string parsing.
 *
 * @param knex The Knex instance to use for building the query.
 * @param type The primary entity type that `filter` is based on.
 * @param filter[keepAliases] Marks specific aliases to keep in the query, even if they are not used
 *   by any selects or conditions, i.e. because you plan on adding your own joins/conditions
 *   against the `QueryBuilder` directly.
 * @param filter[pruneJoins] Disables removing any unused joins, i.e. because you plan on adding your
 *   own joins/conditions against the `QueryBuilder` directly.
 */
export function buildQuery<T extends Entity>(
  knex: Knex,
  type: MaybeAbstractEntityConstructor<T>,
  filter: FilterAndSettings<T> & {
    pruneJoins?: boolean;
    keepAliases?: string[];
  },
): Knex.QueryBuilder<{}, unknown[]> {
  const meta = getMetadata(type);
  const {
    where,
    conditions,
    orderBy,
    limit,
    offset,
    pruneJoins = true,
    keepAliases = [],
    softDeletes = "exclude",
  } = filter;
  const parsed = parseFindQuery(meta, where, { conditions, orderBy, pruneJoins, keepAliases, softDeletes });
  return buildKnexQuery(knex, parsed, { limit, offset });
}

/**
 * Creates a Knex instance that delegates to an existing pg Pool or PoolClient
 * instead of managing its own internal connection pool.
 *
 * When given a `pg.Pool`, each knex query acquires a connection from the pool and
 * releases it when the query completes.
 *
 * When given a `pg.PoolClient`, all knex queries run on that specific client. This
 * is useful when the client has an open transaction (via `BEGIN`) — the knex queries
 * will participate in that transaction and be affected by `COMMIT`/`ROLLBACK`.
 *
 * The returned Knex instance has no internal pool, so there is no need to call
 * `.destroy()` on it — the caller owns the Pool/PoolClient lifecycle.
 */
export function createKnex(poolOrClient: pg.Pool | pg.PoolClient): Knex {
  const knex = baseCreateKnex({ client: "pg", connection: {}, pool: { max: 0 } });
  if (poolOrClient instanceof pg.Pool) {
    knex.client.acquireConnection = () => poolOrClient.connect();
    knex.client.releaseConnection = (conn: pg.PoolClient) => conn.release();
  } else {
    knex.client.acquireConnection = () => poolOrClient;
    knex.client.releaseConnection = () => {};
  }
  return knex;
}
