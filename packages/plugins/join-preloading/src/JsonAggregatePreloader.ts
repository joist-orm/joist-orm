import {
  AliasAssigner,
  Entity,
  EntityManager,
  EntityMetadata,
  EntityOrId,
  HintNode,
  JoinResult,
  LoadHint,
  NestedLoadHint,
  ParsedFindQuery,
  PreloadHydrator,
  PreloadPlugin,
  getEmInternalApi,
  getTables,
  keyToNumber,
  keyToTaggedId,
  kq,
  kqDot,
} from "joist-orm";
import { canPreload } from "./canPreload";
import { partitionHint } from "./partitionHint";

/**
 * A PreloadPlugin implementation that uses `CROSS LATERAL JOIN` and `json_aggregate`
 * to preload/reduce a subtree of data while still being a single row of data.
 */
export class JsonAggregatePreloader implements PreloadPlugin {
  partitionHint(
    meta: EntityMetadata | undefined,
    hint: LoadHint<any>,
  ): [NestedLoadHint<any> | undefined, NestedLoadHint<any> | undefined] {
    return partitionHint(meta, hint);
  }

  addPreloading<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata,
    root: HintNode<T>,
    query: ParsedFindQuery,
  ): PreloadHydrator | undefined {
    const { getAlias } = new AliasAssigner(query);

    // Get the existing primary alias
    const alias = getTables(query)[0].alias;
    const joins = addJoins(em, getAlias, { tree: root, alias, meta }, root, alias, meta);
    // If there are no sql-based preload in the hints, just return
    if (joins.length === 0) {
      return undefined;
    }

    // Include the aggregate `books._ as books`, `comments._ as comments`
    query.selects.push(...joins.map((j) => `${kqDot(j.alias, "_")} as ${kq(j.alias)}`));
    query.lateralJoins = {
      joins: joins.map((j) => j.join),
      bindings: joins.flatMap((j) => j.bindings),
    };

    return (rows, entities) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const parent = entities[i];
        for (const join of joins) {
          join.hydrator(parent, parent, row[join.alias] ?? []);
        }
      }
    };
  }

  getPreloadJoins<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata,
    root: HintNode<T>,
    query: ParsedFindQuery,
  ): JoinResult[] {
    const { getAlias } = new AliasAssigner(query);

    // Get the existing primary alias
    const alias = getTables(query)[0].alias;
    const joins = addJoins(em, getAlias, { tree: root, alias, meta }, root, alias, meta);
    // If there are no sql-based preload in the hints, just return

    // Adapt our json aggregate joins to the higher-level JoinResult
    return joins.map((join) => {
      return {
        selects: [{ value: kqDot(join.alias, "_"), as: join.alias }],
        join: join.join,
        hydrator: (rows, entities) => {
          rows.forEach((row, i) => {
            const parent = entities[i];
            join.hydrator(parent, parent, row[join.alias] ?? []);
          });
        },
        bindings: join.bindings,
      };
    });
  }
}

/** Decodes an array-of-arrays of children entries, and stores them the `parent`'s relation. */
type AggregateJsonHydrator = (root: Entity, parent: Entity, arrays: unknown[][]) => void;

/**
 * For a given hint tree `hint`, finds all SQL-able relations and preloads them.
 *
 * Specifically we use `json_agg` & `json_build_array` to `CROSS LATERAL JOIN`
 * children/grand children back as arbitrarily-deeply nested arrays, and then
 * stash the results in the `EntityManager` `joinLoadedRelations` cache, which
 * each join-instrumented relation will check before making its SQL calls.
 *
 * https://sqlfum.pt/?n=60&indent=2&spaces=1&simplify=1&align=0&case=lower&sql=c2VsZWN0IGEuaWQsIGIuXyBhcyBiLCBjMS5fIGFzIGMxLCBhMS5fIGFzIGExIGZyb20gYXV0aG9ycyBhIGNyb3NzIGpvaW4gbGF0ZXJhbCAoIHNlbGVjdCBqc29uX2FnZyhqc29uX2J1aWxkX2FycmF5KGIuaWQsIGIudGl0bGUsIGIuIm9yZGVyIiwgYi5kZWxldGVkX2F0LCBiLmNyZWF0ZWRfYXQsIGIudXBkYXRlZF9hdCwgYi5hdXRob3JfaWQsIGJyLl8pKSBhcyBfIGZyb20gYm9va3MgYiBjcm9zcyBqb2luIGxhdGVyYWwgKCBzZWxlY3QganNvbl9hZ2coanNvbl9idWlsZF9hcnJheShici5pZCwgYnIucmF0aW5nLCBici5pc19wdWJsaWMsIGJyLmlzX3Rlc3QsIGJyLmNyZWF0ZWRfYXQsIGJyLnVwZGF0ZWRfYXQsIGJyLmJvb2tfaWQsIGMuXykpIGFzIF8gZnJvbSBib29rX3Jldmlld3MgYnIgY3Jvc3Mgam9pbiBsYXRlcmFsICggc2VsZWN0IGpzb25fYWdnKGpzb25fYnVpbGRfYXJyYXkoYy5pZCwgYy50ZXh0LCBjLmNyZWF0ZWRfYXQsIGMudXBkYXRlZF9hdCwgYy51c2VyX2lkLCBjLnBhcmVudF9hdXRob3JfaWQsIGMucGFyZW50X2Jvb2tfaWQsIGMucGFyZW50X2Jvb2tfcmV2aWV3X2lkLCBjLnBhcmVudF9wdWJsaXNoZXJfaWQpKSBhcyBfIGZyb20gY29tbWVudHMgYyB3aGVyZSBjLnBhcmVudF9ib29rX3Jldmlld19pZCA9IGJyLmlkICkgYyB3aGVyZSBici5ib29rX2lkID0gYi5pZCApIGJyIHdoZXJlIGIuYXV0aG9yX2lkID0gYS5pZCApIGIgY3Jvc3Mgam9pbiBsYXRlcmFsICggc2VsZWN0IGpzb25fYWdnKGpzb25fYnVpbGRfYXJyYXkoYzEuaWQsIGMxLnRleHQsIGMxLmNyZWF0ZWRfYXQsIGMxLnVwZGF0ZWRfYXQsIGMxLnVzZXJfaWQsIGMxLnBhcmVudF9hdXRob3JfaWQsIGMxLnBhcmVudF9ib29rX2lkLCBjMS5wYXJlbnRfYm9va19yZXZpZXdfaWQsIGMxLnBhcmVudF9wdWJsaXNoZXJfaWQpKSBhcyBfIGZyb20gY29tbWVudHMgYzEgd2hlcmUgYzEucGFyZW50X2F1dGhvcl9pZCA9IGEuaWQgKSBjMSBjcm9zcyBqb2luIGxhdGVyYWwgKCBzZWxlY3QganNvbl9hZ2coanNvbl9idWlsZF9hcnJheShhMS5pZCwgYTEuZmlyc3RfbmFtZSwgYTEubGFzdF9uYW1lLCBhMS5zc24sIGExLmluaXRpYWxzLCBhMS5udW1iZXJfb2ZfYm9va3MsIGExLmJvb2tfY29tbWVudHMsIGExLmlzX3BvcHVsYXIsIGExLmFnZSwgYTEuZ3JhZHVhdGVkLCBhMS5uaWNrX25hbWVzLCBhMS53YXNfZXZlcl9wb3B1bGFyLCBhMS5hZGRyZXNzLCBhMS5idXNpbmVzc19hZGRyZXNzLCBhMS5xdW90ZXMsIGExLm51bWJlcl9vZl9hdG9tcywgYTEuZGVsZXRlZF9hdCwgYTEubnVtYmVyX29mX3B1YmxpY19yZXZpZXdzLCBhMS4ibnVtYmVyT2ZQdWJsaWNSZXZpZXdzMiIsIGExLnRhZ3Nfb2ZfYWxsX2Jvb2tzLCBhMS5jcmVhdGVkX2F0LCBhMS51cGRhdGVkX2F0LCBhMS5mYXZvcml0ZV9zaGFwZSwgYTEuZmF2b3JpdGVfY29sb3JzLCBhMS5tZW50b3JfaWQsIGExLmN1cnJlbnRfZHJhZnRfYm9va19pZCwgYTEuZmF2b3JpdGVfYm9va19pZCwgYTEucHVibGlzaGVyX2lkKSkgYXMgXyBmcm9tIGF1dGhvcnMgYTEgd2hlcmUgYTEuaWQgPSBhLm1lbnRvcl9pZCApIGExIHdoZXJlIGEuaWQgPSAxOw%3D%3D
 */

/** Given a `parent` like Author, and a hint of `{ books: ..., comments: ... }`, create joins. */
function addJoins<I extends EntityOrId>(
  em: EntityManager,
  getAlias: (tableName: string) => string,
  root: { tree: HintNode<I>; alias: string; meta: EntityMetadata },
  tree: HintNode<I>,
  parentAlias: string,
  parentMeta: EntityMetadata,
): AggregateJoinResult[] {
  const results: AggregateJoinResult[] = [];

  // Join in SQL-able hints from parent
  Object.entries(tree.subHints).forEach(([key, subTree]) => {
    const field = parentMeta.allFields[key];
    // AsyncProperties don't have fields, which is fine, skip for now...
    if (field && canPreload(parentMeta, field)) {
      const otherMeta = field.otherMetadata();
      const otherField = otherMeta.allFields[field.otherFieldName];

      // Use a prefix like `_` to avoid collisions like `InvoiceDocument` -> alias `id` -> collides with the `id` column
      const otherAlias = `_${getAlias(otherMeta.tableName)}`;

      // Do the recursion up-front, so we can work it into our own join/hydrator
      const subJoins = addJoins(em, getAlias, root, subTree, otherAlias, otherMeta);

      // Get all fields with serdes and flatten out the columns
      const columns = Object.values(otherMeta.allFields)
        .filter((f) => f.serde)
        .flatMap((f) => f.serde!.columns);
      const selects = [
        ...columns.map((c) => kqDot(otherAlias, c.columnName)),
        // We eventually need to handle parent types/subtypes here...
        // Combine any grandchilden
        ...subJoins.map((sb) => kqDot(sb.alias, "_")),
      ];

      const aliasMaybeSuffix = kq(`${parentAlias}${field.aliasSuffix}`);

      let where: string;
      let m2mFrom = "";
      if (otherField.kind === "m2o") {
        where = `${kqDot(otherAlias, otherField.serde.columns[0].columnName)} = ${kqDot(parentAlias, "id")}`;
      } else if (otherField.kind === "poly") {
        // Get the component that points to us
        // const comp = otherField.components.find((c) => getAllMetas(parentMeta).some((m) => m.cstr === c.otherMetadata().cstr)) ??
        const comp =
          otherField.components.find((c) => parentMeta.cstr === c.otherMetadata().cstr) ??
          fail(`No component found for ${field.fieldName} -> ${otherField.fieldName}`);
        where = `${kqDot(otherAlias, comp.columnName)} = ${kqDot(parentAlias, "id")}`;
      } else if (otherField.kind === "o2m" || otherField.kind === "lo2m") {
        where = `${kqDot(otherAlias, "id")} = ${aliasMaybeSuffix}.${kq(field.serde!.columns[0].columnName)}`;
      } else if (otherField.kind === "o2o") {
        where = `${kqDot(otherAlias, "id")} = ${aliasMaybeSuffix}.${kq(field.serde!.columns[0].columnName)}`;
      } else if (otherField.kind === "m2m") {
        const m2mAlias = getAlias(otherField.joinTableName);
        // Get the m2m row's id to track in JoinRows
        selects.unshift(kqDot(m2mAlias, "id"));
        m2mFrom = `, ${kq(otherField.joinTableName)} ${kq(m2mAlias)}`;
        where = `
            ${kqDot(parentAlias, "id")} = ${kqDot(m2mAlias, otherField.columnNames[1])} AND
            ${kqDot(m2mAlias, otherField.columnNames[0])} = ${kqDot(otherAlias, "id")}
          `;
      } else {
        throw new Error(`Unsupported otherField.kind ${otherField.kind}`);
      }

      const bindings = subJoins.flatMap((sj) => sj.bindings);
      const needsSubSelect = subTree.entities.size !== root.tree.entities.size;
      if (needsSubSelect) {
        bindings.push(
          [...subTree.entities]
            .filter((e) => typeof e === "string" || !e.isNewEntity)
            .map((e) => keyToNumber(root.meta, typeof e === "string" ? e : e.id)),
        );
      }

      const join = `
        cross join lateral (
          select json_agg(json_build_array(${selects.join(", ")}) order by ${kq(otherAlias)}.id) as _
          from ${kq(otherMeta.tableName)} ${kq(otherAlias)} ${m2mFrom}
          ${subJoins.map((sb) => sb.join).join("\n")}
          where ${where}
          ${needsSubSelect ? ` AND ${kqDot(root.alias, "id")} = ANY(?)` : ""}
        ) ${kq(otherAlias)}
      `;

      const hydrator: AggregateJsonHydrator = (root, parent, arrays) => {
        // If we had overlapping load hints, i.e. `author.books` for [a1, a2] and `author.comments` for [a1], and
        // we're processing the arrays of comments, but for a root author like `a2` that didn't ask for our load
        // hint, then skip it to keep the relation unloaded.
        if (subTree.entitiesKind === "instances" && !subTree.entities.has(root as any)) return;
        if (subTree.entitiesKind === "ids" && !subTree.entities.has(root.idTagged as any)) return;

        // We get back an array of [[1, title], [2, title], [3, title]]
        const children = arrays.map((array) => {
          // If we've snuck the m2m row id into the json arry, ignore it
          const m2mOffset = field.kind === "m2m" ? 1 : 0;
          const taggedId = keyToTaggedId(otherMeta, array[m2mOffset] as any)!;
          const entity =
            em.findExistingInstance<Entity>(taggedId) ??
            (
              em.hydrate(
                otherMeta.cstr,
                // Turn the array into a hash for em.hydrate
                [Object.fromEntries(columns.map((c, i) => [c.columnName, c.mapFromJsonAgg(array[m2mOffset + i])]))],
                // When em.refreshing this should be true?
                { overwriteExisting: false },
              ) as Entity[]
            )[0];
          // Tell the internal JoinRow booking-keeping about this m2m row
          if (field.kind === "m2m") {
            const m2m = (parent as any)[key];
            getEmInternalApi(em)
              .joinRows(m2m)
              .addExisting(m2m, array[0] as any, parent, entity);
          }
          // Within each child, look for grandchildren
          subJoins.forEach((sub, i) => {
            // array[i] could be null if there are no grandchildren, but still call `sub` to
            // process it so that we store the empty array into the em.joinLoadedRelations, to
            // avoid the relation.load method later doing a SQL for rows we know are not there.
            sub.hydrator(root, entity, (array[m2mOffset + columns.length + i] as any) ?? []);
          });
          return entity;
        });
        // Cache the entities so `.load`s will see them
        getEmInternalApi(em).setPreloadedRelation(parent.idTagged, key, children);
      };

      results.push({ alias: otherAlias, join, bindings, hydrator });
    }
  });

  return results;
}

/** A preload-loadable join for a given child, with potentially grand-child joins contained within it. */
type AggregateJoinResult = {
  /** The alias for this child's single json-array-d column, i.e. `b._` or `c._`. */
  alias: string;
  /** The SQL for this child's lateral join, which itself might have recursive lateral joins. */
  join: string;
  /** The hydrator for this child's lateral join, which itself might recursively hydrator subjoins. */
  hydrator: AggregateJsonHydrator;
  /** Any bindings for filtering subjoins by a subset of the root entities, to avoid over-fetching. */
  bindings: any[];
};
