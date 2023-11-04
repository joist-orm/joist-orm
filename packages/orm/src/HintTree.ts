import { Entity } from "./Entity";
import { TaggedId } from "./EntityManager";
import { LoadHint } from "./loadHints";
import { normalizeHint } from "./normalizeHints";

// We support preloading in `populate` with existing entities, or `load` with just ids.
// (We could ask `populate` to convert its entities to ids, but it's convenient for it
// to keep the HintTree populated with Entities so that newly-created entities can have
// their collections marked as loaded.
export type EntityOrId = Entity | TaggedId;

export type HintNode<E extends EntityOrId> = {
  /** These entities are the root entities of our preload, i.e. we use them to trim the tree to prevent over-fetching. */
  entities: Set<E>;
  /** A runtime indication of the type of `E`. */
  entitiesKind: "instances" | "ids" | "none";
  subHints: { [key: string]: HintNode<E> };
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
export function buildHintTree<E extends EntityOrId>(
  hints: readonly { entity: E; hint: LoadHint<any> | undefined }[] | LoadHint<any>,
): HintNode<E> {
  if (Array.isArray(hints)) {
    const entitiesKind = typeof hints[0].entity === "string" ? ("ids" as const) : ("instances" as const);
    const root: HintNode<E> = { entitiesKind, entities: new Set(), subHints: {} };
    for (const { entity, hint } of hints) {
      addHintNode(root, entity, hint);
    }
    return root;
  } else {
    const root: HintNode<E> = { entitiesKind: "none", entities: new Set(), subHints: {} };
    addHintNode(root, undefined, hints as LoadHint<any>);
    return root;
  }
}

function addHintNode<E extends EntityOrId>(node: HintNode<E>, entity: E | undefined, hint: LoadHint<any> | undefined) {
  // It's tempting to filter out new entities here, but we need to call `.load()` on their
  // relations to ensure the `.get`s will later work, even if we don't look in the db for them.
  if (entity) node.entities.add(entity);
  if (hint) {
    for (const [key, nestedHint] of Object.entries(normalizeHint(hint))) {
      const child = (node.subHints[key] ??= { entitiesKind: node.entitiesKind, entities: new Set(), subHints: {} });
      addHintNode(child, entity, nestedHint);
    }
  }
}
