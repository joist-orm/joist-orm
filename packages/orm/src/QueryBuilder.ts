import { Knex } from "knex";
import { Entity } from "./Entity";
import { FilterAndSettings } from "./EntityFilter";
import { getMetadata } from "./EntityMetadata";
import { buildKnexQuery } from "./drivers/buildKnexQuery";
import { MaybeAbstractEntityConstructor, parseFindQuery } from "./index";

/**
 * Builds the SQL/knex queries for `EntityManager.find` calls.
 *
 * Note this is generally for our own internal implementation details and not meant to
 * be a user-facing QueryBuilder, i.e. users should use Knex for that and just use SQL
 * directly (for any non-trivial queries that `EntityManager.find` does not support).
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

export function abbreviation(tableName: string): string {
  return tableName
    .split("_")
    .map((w) => w[0])
    .join("");
}
