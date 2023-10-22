import { Entity } from "./Entity";
import { LoadHint } from "./loadHints";
import { normalizeHint } from "./normalizeHints";

// We support preloading in `populate` with existing entities, or `load` with just ids.
// (We could ask `populate` to convert its entities to ids, but it's convenient for it
// to keep the HintTree populated with Entities so that newly-created entities can have
// their collections marked as loaded.
export type EntityOrId = Entity | string;

export type HintNode<T extends EntityOrId> = {
  /** These entities are the root entities of our preload, i.e. we use them to trim the tree to prevent over-fetching. */
  entities: Set<T>;
  subHints: { [key: string]: HintNode<T> };
};

/**
 * Given a number of potentially overlapping load hints, i.e. `{ authors: "books" }` and
 * `{ authors: "reviews" }`, combines them into a single `HintNode` tree, with bookkeeping
 * of which entities requested each specific node of the tree.
 *
 * I.e. if we're populating three publishers, two with `{ authors: "books" }` and one with
 * `{ authors: "reviews" }`, we'll end up with a tree like:
 *
 * ```
 *  {
 *    authors: {
 *      entities: [p1, p2, p3],
 *      subHints: {
 *        books: { entities: [p1, p2], subHints: {} },
 *        reviews: { entities: [p3], subHints: {} },
 *      }
 *    }
 *  }
 * ```
 *
 * Which will let us preload `authors` for all three publishers, but `books` only for the
 * first two, and `reviews` only for the third, i.e. we can prevent over-fetching.
 */
export function buildHintTree<T extends EntityOrId>(
  populates: readonly { entity: T; hint: LoadHint<any> | undefined }[],
): HintNode<T> {
  const root: HintNode<T> = { entities: new Set(), subHints: {} };
  for (const { entity, hint } of populates) {
    populateHintNode(root, entity, hint);
  }
  return root;
}

function populateHintNode<T extends EntityOrId>(node: HintNode<T>, entity: T, hint: LoadHint<any> | undefined) {
  // It's tempting to filter out new entities here, but we need to call `.load()` on their
  // relations to ensure the `.get`s will later work, even if we don't look in the db for them.
  node.entities.add(entity);
  if (hint) {
    for (const [key, nestedHint] of Object.entries(normalizeHint(hint))) {
      const child = (node.subHints[key] ??= { entities: new Set(), subHints: {} });
      populateHintNode(child, entity, nestedHint);
    }
  }
}
