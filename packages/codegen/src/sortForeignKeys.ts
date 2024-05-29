import { EntityDbMetadata, ManyToOneField, PolymorphicFieldComponent } from "./EntityDbMetadata";

/**
 * Sorts entities by non-deferred foreign key order.
 *
 * Ideally databases/schemas will support/enable deferred FKs, which let us insert/delete rows
 * in any arbitrary order, and the FK checks will not be applied until txn commit.
 *
 * However, if not enabled/support, we have to worry about two things:
 *
 * 1. Inserting "parents" before their children
 *    - And if the parent has a circular reference to not-yet-inserted cycle
 * 2. Deleting "children" before their parents
 *    - Again if the parent has a circular reference to the child
 *
 * For both of these, we can just look at the FK ordering to "put the parent first",
 * but run into two problems:
 *
 * - If there is a cycle for not-null FKs, that breaks both INSERTs and DELETEs, so we
 * must warn the user about these to fix.
 * - If there is a cycle with nullable FKs, we can work around that by using NULL as a
 * transient/dummy value, for the initial insert, do the 2nd insert, and then "fixup" the
 * first insert with a UPDATE to the actual column value.
 *
 * Given ^, we set the `entity.nonDeferredFkOrder` of each entity, and then also return
 * two arrays of all soft-cycle (nullable, fixup-able) and hard-cycle (not-nullable, blocking)
 * keys.
 */
export function sortByNonDeferredForeignKeys(entities: EntityDbMetadata[]): {
  nullableCycles: string[];
  notNullCycles: string[];
} {
  // Kahn's algorithm, O(V + E)

  const graph: Record<string, Node> = Object.fromEntries(
    entities.map((e) => [
      e.name,
      {
        entity: e,
        upstreamFks: new Set(),
        downstreamFks: new Set(),
      },
    ]),
  );

  // Add all not-null deps first, as they are most important, cannot be fixed up.
  // - Failures here are fatal-ish
  // Then add nullable deps next, as they can be fixed-up

  const nullableCycles: string[] = [];
  const notNullCycles: string[] = [];

  // If we see `books.author_id`, mark `author.inDegree++`
  entities.forEach((entity) => {
    entity.nonDeferredFks
      .filter((m2o) => m2o.notNull)
      .forEach((m2o) => {
        const added = addDependency(graph, entity, m2o);
        if (Array.isArray(added)) notNullCycles.push(added.join(" -> "));
      });
  });

  // Do it again for nullable
  entities.forEach((entity) => {
    entity.nonDeferredFks
      .filter((m2o) => !m2o.notNull)
      .forEach((m2o) => {
        const added = addDependency(graph, entity, m2o);
        if (Array.isArray(added)) nullableCycles.push(added.join(" -> "));
      });
  });

  // Topological Sort
  // Enqueue entities with 0 out-degree (reverse Kahn), i.e. `authors`, they'll be at the top of the tree
  let queue = Object.values(graph).filter((n) => n.upstreamFks.size === 0);
  let level = 1;
  while (queue.length > 0) {
    // console.log(`Queue: ${queue.map((n) => n.entity.name)}`);
    const nextLevel: Node[] = [];
    for (const current of queue) {
      current.entity.nonDeferredFkOrder = level;
      current.downstreamFks.forEach((node) => {
        if (node.upstreamFks.delete(current) && node.upstreamFks.size === 0) {
          nextLevel.push(node);
        }
      });
    }
    queue = nextLevel;
    level++;
  }

  // Anything left with a -1 value means there is a cycle
  // Use a marker value for "cyclic"
  entities.filter((e) => e.nonDeferredFkOrder === -1).forEach((e) => (e.nonDeferredFkOrder = 100_000));

  return { nullableCycles, notNullCycles: notNullCycles };
}

type Node = {
  entity: EntityDbMetadata;
  upstreamFks: Set<Node>;
  downstreamFks: Set<Node>;
};

function addDependency(
  graph: Record<string, Node>,
  entity: EntityDbMetadata,
  m2o: ManyToOneField | PolymorphicFieldComponent,
): true | string[] {
  const from = graph[entity.name]; // i.e. books
  const to = graph[m2o.otherEntity.name]; // i.e. authors
  const cycle = willCreateCycle(graph, from, to);
  if (cycle) {
    // console.log(`Skipped ${entity.name}.${m2o.columnName} -> ${m2o.otherEntity.name}`);
    return cycle;
  }
  // console.log(`Added ${entity.name}.${m2o.columnName} -> ${m2o.otherEntity.name}`);
  from.upstreamFks.add(to);
  to.downstreamFks.add(from);
  return true;
}

function willCreateCycle(graph: Record<string, Node>, from: Node, to: Node): false | string[] {
  const visited: Set<Node> = new Set();
  const stack: Set<Node> = new Set();
  const path: Node[] = [];
  // If `from=books[.author_id]` pointing at `to=authors`, we want to do `to.downstreamFks.add(from)`,
  // but first make sure that none of from's dowstreams are to, because if so it would make a cycle.
  return dfs(graph, visited, stack, path, from, to);
}

function dfs(
  graph: Record<string, Node>,
  visited: Set<Node>,
  stack: Set<Node>,
  path: Node[],
  current: Node,
  target: Node,
): false | string[] {
  visited.add(current);
  stack.add(current);
  path.push(current);
  for (const neighbor of current.downstreamFks) {
    if (neighbor === target) {
      return [...path, neighbor].map((n) => n.entity.name);
    }
    if (!visited.has(neighbor)) {
      const cycle = dfs(graph, visited, stack, path, neighbor, target);
      if (cycle) return cycle;
    }
  }
  stack.delete(current);
  path.pop();
  return false;
}
