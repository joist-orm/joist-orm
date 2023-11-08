import { EntityMetadata, getProperties, LoadHint, PersistedAsyncReferenceImpl } from "joist-orm";
import { NestedLoadHint } from "joist-orm/build/src/loadHints";
import { deepNormalizeHint, normalizeHint } from "joist-orm/build/src/normalizeHints";
import { canPreload } from "./canPreload";

/** Partitions a hint into SQL-able and non-SQL-able hints. */
export function partitionHint(
  meta: EntityMetadata | undefined,
  hint: LoadHint<any>,
): [NestedLoadHint<any> | undefined, NestedLoadHint<any> | undefined] {
  let sql: NestedLoadHint<any> | undefined = undefined;
  let non: NestedLoadHint<any> | undefined = undefined;
  for (const [key, subHint] of Object.entries(normalizeHint(hint))) {
    const field = meta?.allFields[key];
    if (field && canPreload(meta, field)) {
      const [_sql, _non] = partitionHint(field.otherMetadata(), subHint);
      deepMerge(((sql ??= {})[key] ??= {}), _sql ?? {});
      if (_non) deepMerge(((non ??= {})[key] ??= {}), _non);
    } else {
      // If this isn't a raw SQL relation, but it exposes a load-hint, inline that into our SQL.
      // This will get the non-SQL relation's underlying SQL data preloaded.
      const p = meta && getProperties(meta)[key];
      if (p && p.loadHint) {
        // Maybe we could have `PersistedAsyncReferenceImpl` internally/dynamically return us th right
        // load hint, instead of special casing it like this? Like it could internally check "needs calc?"
        if (p instanceof PersistedAsyncReferenceImpl) {
          const [_sql, _non] = partitionHint(p.otherMeta, subHint);
          if (_sql) deepMerge(((sql ??= {})[key] ??= {}), _sql);
          if (_non) deepMerge(((non ??= {})[key] ??= {}), _non);
        } else {
          // It's not clear what to do with the subHint here, if anything--ideally it could stitch
          // on top of load hint but only in the places that made sense. But we'd risk over-fetching.
          const [_sql, _non] = partitionHint(meta, p.loadHint);
          if (_sql) deepMerge((sql ??= {}), _sql);
          if (_non) deepMerge((non ??= {}), _non);
        }
      } else {
        deepMerge(((non ??= {})[key] ??= {}), deepNormalizeHint(subHint));
      }
    }
  }
  return [sql, non];
}

function deepMerge<T extends object>(a: T, b: T): void {
  for (const [key, value] of Object.entries(b)) {
    deepMerge(((a as any)[key] ??= {}), value);
  }
}
