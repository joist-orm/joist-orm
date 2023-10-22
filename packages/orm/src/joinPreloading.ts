import { Entity } from "./Entity";
import { EntityManager, getEmInternalApi } from "./EntityManager";
import { EntityMetadata } from "./EntityMetadata";
import { EntityOrId, HintNode } from "./HintTree";
import { abbreviation } from "./QueryBuilder";
import { ParsedFindQuery, addTablePerClassJoinsAndClassTag, joinClauses } from "./QueryParser";
import { keyToNumber } from "./keys";
import { kq, kqDot } from "./keywords";
import { assertNever, fail, indexBy } from "./utils";

// add the select books clause to authors
// add the CJL for authors -> books
//   build the json_build_array for book
//   add the CJL for books -> book_reviews
//     build the json_build_array for book_reviews
// add the select comments clause to authors
// add the CJL for authors -> comments
//   build the json_build_array for comments
//
// https://sqlfum.pt/?n=60&indent=2&spaces=1&simplify=1&align=0&case=lower&sql=c2VsZWN0IGEuaWQsIGIuXyBhcyBiLCBjMS5fIGFzIGMxLCBhMS5fIGFzIGExIGZyb20gYXV0aG9ycyBhIGNyb3NzIGpvaW4gbGF0ZXJhbCAoIHNlbGVjdCBqc29uX2FnZyhqc29uX2J1aWxkX2FycmF5KGIuaWQsIGIudGl0bGUsIGIuIm9yZGVyIiwgYi5kZWxldGVkX2F0LCBiLmNyZWF0ZWRfYXQsIGIudXBkYXRlZF9hdCwgYi5hdXRob3JfaWQsIGJyLl8pKSBhcyBfIGZyb20gYm9va3MgYiBjcm9zcyBqb2luIGxhdGVyYWwgKCBzZWxlY3QganNvbl9hZ2coanNvbl9idWlsZF9hcnJheShici5pZCwgYnIucmF0aW5nLCBici5pc19wdWJsaWMsIGJyLmlzX3Rlc3QsIGJyLmNyZWF0ZWRfYXQsIGJyLnVwZGF0ZWRfYXQsIGJyLmJvb2tfaWQsIGMuXykpIGFzIF8gZnJvbSBib29rX3Jldmlld3MgYnIgY3Jvc3Mgam9pbiBsYXRlcmFsICggc2VsZWN0IGpzb25fYWdnKGpzb25fYnVpbGRfYXJyYXkoYy5pZCwgYy50ZXh0LCBjLmNyZWF0ZWRfYXQsIGMudXBkYXRlZF9hdCwgYy51c2VyX2lkLCBjLnBhcmVudF9hdXRob3JfaWQsIGMucGFyZW50X2Jvb2tfaWQsIGMucGFyZW50X2Jvb2tfcmV2aWV3X2lkLCBjLnBhcmVudF9wdWJsaXNoZXJfaWQpKSBhcyBfIGZyb20gY29tbWVudHMgYyB3aGVyZSBjLnBhcmVudF9ib29rX3Jldmlld19pZCA9IGJyLmlkICkgYyB3aGVyZSBici5ib29rX2lkID0gYi5pZCApIGJyIHdoZXJlIGIuYXV0aG9yX2lkID0gYS5pZCApIGIgY3Jvc3Mgam9pbiBsYXRlcmFsICggc2VsZWN0IGpzb25fYWdnKGpzb25fYnVpbGRfYXJyYXkoYzEuaWQsIGMxLnRleHQsIGMxLmNyZWF0ZWRfYXQsIGMxLnVwZGF0ZWRfYXQsIGMxLnVzZXJfaWQsIGMxLnBhcmVudF9hdXRob3JfaWQsIGMxLnBhcmVudF9ib29rX2lkLCBjMS5wYXJlbnRfYm9va19yZXZpZXdfaWQsIGMxLnBhcmVudF9wdWJsaXNoZXJfaWQpKSBhcyBfIGZyb20gY29tbWVudHMgYzEgd2hlcmUgYzEucGFyZW50X2F1dGhvcl9pZCA9IGEuaWQgKSBjMSBjcm9zcyBqb2luIGxhdGVyYWwgKCBzZWxlY3QganNvbl9hZ2coanNvbl9idWlsZF9hcnJheShhMS5pZCwgYTEuZmlyc3RfbmFtZSwgYTEubGFzdF9uYW1lLCBhMS5zc24sIGExLmluaXRpYWxzLCBhMS5udW1iZXJfb2ZfYm9va3MsIGExLmJvb2tfY29tbWVudHMsIGExLmlzX3BvcHVsYXIsIGExLmFnZSwgYTEuZ3JhZHVhdGVkLCBhMS5uaWNrX25hbWVzLCBhMS53YXNfZXZlcl9wb3B1bGFyLCBhMS5hZGRyZXNzLCBhMS5idXNpbmVzc19hZGRyZXNzLCBhMS5xdW90ZXMsIGExLm51bWJlcl9vZl9hdG9tcywgYTEuZGVsZXRlZF9hdCwgYTEubnVtYmVyX29mX3B1YmxpY19yZXZpZXdzLCBhMS4ibnVtYmVyT2ZQdWJsaWNSZXZpZXdzMiIsIGExLnRhZ3Nfb2ZfYWxsX2Jvb2tzLCBhMS5jcmVhdGVkX2F0LCBhMS51cGRhdGVkX2F0LCBhMS5mYXZvcml0ZV9zaGFwZSwgYTEuZmF2b3JpdGVfY29sb3JzLCBhMS5tZW50b3JfaWQsIGExLmN1cnJlbnRfZHJhZnRfYm9va19pZCwgYTEuZmF2b3JpdGVfYm9va19pZCwgYTEucHVibGlzaGVyX2lkKSkgYXMgXyBmcm9tIGF1dGhvcnMgYTEgd2hlcmUgYTEuaWQgPSBhLm1lbnRvcl9pZCApIGExIHdoZXJlIGEuaWQgPSAxOw%3D%3D

/**
 * For a given hint tree `hint`, finds all SQL-able relations and preloads them.
 *
 * Specifically we use `json_agg` & `json_build_array` to `CROSS LATERAL JOIN`
 * children/grand children back as arbitrarily-deeply nested arrays, and then
 * stash the results in the `EntityManager` `joinLoadedRelations` cache, which
 * each join-instrumented relation will check before making its SQL calls.
 */
export async function preloadJoins<T extends Entity, I extends EntityOrId>(
  em: EntityManager,
  meta: EntityMetadata<T>,
  tree: HintNode<I>,
  mode: "populate",
): Promise<void>;
export async function preloadJoins<T extends Entity, I extends EntityOrId>(
  em: EntityManager,
  meta: EntityMetadata<T>,
  tree: HintNode<I>,
  mode: "load",
): Promise<T[]>;
export async function preloadJoins<T extends Entity, I extends EntityOrId>(
  em: EntityManager,
  meta: EntityMetadata<T>,
  root: HintNode<I>,
  mode: "load" | "populate",
): Promise<void | T[]> {
  const { getAlias } = new AliasAssigner();

  const alias = getAlias(meta.tableName);
  const { aliases, joins, processors, bindings } = addJoins(
    em,
    getAlias,
    { tree: root, alias, meta },
    root,
    alias,
    meta,
  );

  // Create a ParsedFindQuery to reuse addTablePerClassJoinsAndClassTag
  const query: ParsedFindQuery = { selects: [], tables: [], conditions: [], orderBys: [] };
  if (mode === "populate") {
    query.selects.push(kqDot(alias, "id"));
    // We may have not found any SQL-preload-able relations in the load hint
    if (joins.length === 0) return;
  } else if (mode === "load") {
    query.selects.push(`${kq(alias)}.*`);
    addTablePerClassJoinsAndClassTag(query, meta, alias, true);
  } else {
    assertNever(mode);
  }

  // Push `books._ as books`, `comments._ as comments`
  query.selects.push(...aliases.map((a) => `${kqDot(a, "_")} as ${kq(a)}`));

  const sql = `
    select ${query.selects.join(", ")}
    from ${kq(meta.tableName)} ${kq(alias)}
    ${joinClauses(query.tables).join("\n")}
    ${joins.join(" ")}
    where ${kq(alias)}.id = ANY(?)
    order by ${kq(alias)}.id;
  `;

  const ids = [...root.entities]
    .filter((e) => typeof e === "string" || !e.isNewEntity)
    .map((e) => keyToNumber(meta, typeof e === "string" ? e : e.id));

  // console.log("PRELOADING", JSON.stringify(root), sql);
  const rows = await em.driver.executeQuery(em, sql, [...bindings, ids]);

  if (mode === "populate") {
    // B/c this is populate, don't return anything (new entities), just call the processors
    const entitiesById = indexBy(
      [...root.entities].filter((e) => typeof e !== "string" && !e.isNewEntity) as Entity[],
      (e) => keyToNumber(meta, e.id),
    );
    rows.forEach((row) => {
      const parent = entitiesById.get(row["id"])!;
      processors.forEach((p, i) => p(parent as I, parent, row[aliases[i]] ?? []));
    });
  } else if (mode === "load") {
    // Pass overwriteExisting (which is the default anyway) because it might be EntityManager.refresh calling us,
    // and we should only be getting here if the row wasn't already loaded in the EM. Note that in the preload
    // processors, we do use `overwriteExisting: false` to avoid writing over WIP changes while hooking up relations.
    const entities = rows.map((row) => em.hydrate(meta.cstr, row, { overwriteExisting: true }));
    rows.forEach((row, i) => {
      const parent = entities[i];
      processors.forEach((p, i) => p(parent.id as I, parent, row[aliases[i]] ?? []));
    });
    return entities;
  } else {
    assertNever(mode);
  }
}

/** Decodes an array-of-arrays of children entries, and stores them the `parent`'s relation. */
type Processor<I extends EntityOrId> = (root: I, parent: Entity, arrays: unknown[][]) => void;

/** Any preload-loadable joins, potentially nested. */
type JoinsResult<I extends EntityOrId> = {
  /** The aliases for this level's json-array-d column, i.e. `b._` or `c._`. */
  aliases: string[];
  /** The SQL for this level's lateral joins, which themselves might have recursive lateral joins. */
  joins: string[];
  /** The processors for this level's lateral joins, which themselves might recursively processor subjoins. */
  processors: Processor<I>[];
  /** Any bindings for filtering subjoins by a subset of the root entities, to avoid over-fetching. */
  bindings: any[];
};

/** Given a `parent` like Author, and a hint of `{ books: ..., comments: ... }`, create joins. */
function addJoins<I extends EntityOrId>(
  em: EntityManager,
  getAlias: (tableName: string) => string,
  root: { tree: HintNode<I>; alias: string; meta: EntityMetadata<any> },
  tree: HintNode<I>,
  parentAlias: string,
  parentMeta: EntityMetadata<any>,
): JoinsResult<I> {
  const aliases: string[] = [];
  const joins: string[] = [];
  const processors: Processor<I>[] = [];
  const bindings: any[] = [];

  // Join in SQL-able hints from parent
  Object.entries(tree.subHints).forEach(([key, subTree]) => {
    const field = parentMeta.allFields[key];
    // AsyncProperties don't have fields, which is fine, skip for now...
    if (field && (field.kind === "o2m" || field.kind === "o2o" || field.kind === "m2o" || field.kind === "m2m")) {
      const otherMeta = field.otherMetadata();
      // We don't support preloading tables with inheritance yet
      if (!!otherMeta.baseType || otherMeta.subTypes.length > 0) return;
      // If `otherField` is missing, this could be a large collection which currently can't be loaded...
      const otherField = otherMeta.allFields[field.otherFieldName];
      if (!otherField) return;
      // If otherField is a poly that points to a sub/base component, we don't support that yet
      if (otherField.kind === "poly" && !otherField.components.some((c) => c.otherMetadata() === parentMeta)) return;

      const otherAlias = getAlias(otherMeta.tableName);
      aliases.push(otherAlias);

      // Do the recursion up-front, so we can work it into our own join/processor
      const {
        aliases: subAliases,
        joins: subJoins,
        processors: subProcessors,
        bindings: subBindings,
      } = addJoins(em, getAlias, root, subTree, otherAlias, otherMeta);

      bindings.push(...subBindings);

      // Get all fields with serdes and flatten out the columns
      const columns = Object.values(otherMeta.allFields)
        .filter((f) => f.serde)
        .flatMap((f) => f.serde!.columns);
      const selects = [
        ...columns.map((c) => kqDot(otherAlias, c.columnName)),
        // We eventually need to handle parent types/subtypes here...
        // Combine any grandchilden
        ...subAliases.map((a) => kqDot(a, "_")),
      ];

      const aliasMaybeSuffix = kq(`${parentAlias}${field.aliasSuffix}`);

      let where: string;
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
        // Sneak in m2m join into subJoins
        subJoins.unshift(`, ${kq(otherField.joinTableName)} ${kq(m2mAlias)}`);
        where = `
            ${kqDot(parentAlias, "id")} = ${kqDot(m2mAlias, otherField.columnNames[1])} AND
            ${kqDot(m2mAlias, otherField.columnNames[0])} = ${kqDot(otherAlias, "id")}
          `;
      } else {
        throw new Error(`Unsupported otherField.kind ${otherField.kind}`);
      }

      const needsSubSelect = subTree.entities.size !== root.tree.entities.size;
      if (needsSubSelect) {
        bindings.push(
          [...subTree.entities]
            .filter((e) => typeof e === "string" || !e.isNewEntity)
            .map((e) => keyToNumber(root.meta, typeof e === "string" ? e : e.id)),
        );
      }

      joins.push(`
          cross join lateral (
            select json_agg(json_build_array(${selects.join(", ")})) as _
            from ${kq(otherMeta.tableName)} ${kq(otherAlias)}
            ${subJoins.join("\n")}
            where ${where}
            ${needsSubSelect ? ` AND ${kqDot(root.alias, "id")} = ANY(?)` : ""}
          ) ${kq(otherAlias)}
        `);

      processors.push((root, parent, arrays) => {
        // If we had overlapping load hints, i.e. `author.books` for [a1, a2] and `author.comments` for [a1], and
        // we're processing the arrays of comments, but for a root author like `a2` that didn't ask for our load
        // hint, then skip it to keep the relation unloaded.
        if (!subTree.entities.has(root)) return;

        // We get back an array of [[1, title], [2, title], [3, title]]
        const children = arrays.map((array) => {
          // If we've snuck the m2m row id into the json arry, ignore it
          const m2mOffset = field.kind === "m2m" ? 1 : 0;
          // Turn the array into a hash for em.hydrate
          const data = Object.fromEntries(
            columns.map((c, i) => [c.columnName, c.mapFromJsonAgg(array[m2mOffset + i])]),
          );
          const entity = em.hydrate(otherMeta.cstr, data, { overwriteExisting: false });
          // Tell the internal JoinRow booking-keeping about this m2m row
          if (field.kind === "m2m") {
            const m2m = (parent as any)[key];
            getEmInternalApi(em)
              .joinRows(m2m)
              .addExisting(m2m, array[0] as any, parent, entity);
          }
          // Within each child, look for grandchildren
          subProcessors.forEach((sub, i) => {
            // array[i] could be null if there are no grandchildren, but still call `sub` to
            // process it so that we store the empty array into the em.joinLoadedRelations, to
            // avoid the relation.load method later doing a SQL for rows we know are not there.
            sub(root, entity, (array[m2mOffset + columns.length + i] as any) ?? []);
          });
          return entity;
        });
        // Cache the entities so `.load`s will see them
        getEmInternalApi(em).setPreloadedRelation(parent.idTagged, key, children);
      });
    }
  });

  return { aliases, joins, processors, bindings };
}

class AliasAssigner {
  #aliases: Record<string, number> = {};

  constructor() {
    this.getAlias = this.getAlias.bind(this);
  }

  getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = this.#aliases[abbrev] || 0;
    this.#aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }
}
