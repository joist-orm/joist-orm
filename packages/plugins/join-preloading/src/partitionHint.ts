import {
  deepNormalizeHint,
  EntityMetadata,
  getProperties,
  LoadHint,
  NestedLoadHint,
  normalizeHint,
  ReactiveReferenceImpl,
} from "joist-orm";
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
        // Maybe we could have `PersistedAsyncReferenceImpl` internally/dynamically return us the right
        // load hint, instead of special casing it like this? Like it could internally check "needs calc?"
        if (p instanceof ReactiveReferenceImpl) {
          // Instead of using p.loadHint, we'll just follow the FK in the database and go to the subHint
          const [_sql, _non] = partitionHint(p.otherMeta, subHint);
          deepMerge(((sql ??= {})[key] ??= {}), _sql ?? {});
          if (_non) deepMerge(((non ??= {})[key] ??= {}), _non);
          continue;
        } else {
          // It's not clear what to do with the subHint here, if anything--ideally it could stitch
          // on top of load hint but only in the places that made sense. But we'd risk over-fetching.
          // ...also we don't want to preload ReactiveField full hint vs. just using their
          // calculated values.
          // const [_sql, _non] = partitionHint(meta, p.loadHint);
          // if (_sql) deepMerge((sql ??= {}), _sql);
          // if (_non) deepMerge((non ??= {}), _non);
        }
      }
      // Even if we did some SQL preloads, the subHint needs to go through the non-sql path.
      deepMerge(((non ??= {})[key] ??= {}), deepNormalizeHint(subHint));
    }
  }
  return [sql, non];
}

function deepMerge<T extends object>(a: T, b: T): void {
  for (const [key, value] of Object.entries(b)) {
    deepMerge(((a as any)[key] ??= {}), value);
  }
}
