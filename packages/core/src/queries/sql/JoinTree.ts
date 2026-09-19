import { type Entity, isEntity } from "src/Entity.ts";
import type { IdOf } from "src/EntityManager.ts";
import type { InnerJoin, LeftJoin } from "src/queries/sql/Expr.ts";
import type { QueryCondition, QueryJoin, QueryJoinInput } from "src/queries/sql/query.ts";
import {
  type CollectionJoin,
  type TableFilter,
  type TableFor,
  getTableMgmt,
  isTable,
  newTableProxy,
  tableEntityWhere,
  tableWhere,
} from "src/queries/sql/Tables.ts";
import type { FieldsOf } from "src/typeMap.ts";
import { fail } from "src/utils.ts";

/** Domain filters and optional table bindings for one node in a relationship tree. */
export type JoinTree<T extends Entity> = Omit<TableFilter<T>, RelationNames<T>> & {
  readonly as?: TableFor<T>;
} & {
  readonly [K in RelationNames<T>]?: FieldsOf<T>[K] extends {
    kind: "m2o" | "o2m" | "lo2m" | "m2m" | "o2o";
    type: infer U extends Entity;
  }
    ? JoinTree<U> | (K extends keyof TableFilter<T> ? TableFilter<T>[K] : JoinedEntityFilter<U>)
    : never;
};

/**
 * Filters entities, e.g. `{ books: "b:1" }` filters Book.id to 1.
 *
 * Adapted from `em.find`s EntityFilter, rather than a direct copy:
 *
 * - Keeps entity/ID, list, boolean, and `ne` filters, but omits scopes, find aliases, nested objects, and logical groups.
 *   - JoinTree supplies nested objects and table bindings separately.
 * - Lists can mix entities and IDs, unlike EntityFilter's separate entity[] and ID[] alternatives.
 * - Null is always allowed because these relationships use LEFT joins.
 * - undefined comes from JoinTree's optional relationship keys.
 */
type JoinedEntityFilter<T extends Entity> =
  | IdOf<T>
  | T
  | readonly (IdOf<T> | T)[]
  | boolean
  | null
  | { ne: IdOf<T> | T | null | undefined };

type RelationNames<T extends Entity> = {
  [K in keyof FieldsOf<T>]: FieldsOf<T>[K] extends { kind: "m2o" | "poly" | "o2m" | "lo2m" | "m2m" | "o2o" }
    ? K
    : never;
}[keyof FieldsOf<T>];

/**
 * Validates a join tree against the entity in `from`, preserving its exact table bindings.
 *
 * I.e. given:
 *
 * ```ts
 * const [a, b] = tables(Author, Book);
 * em.query({
 *   from: a,
 *   join: { books: { as: b, title: "One" } },
 *   select: { title: b.title },
 * });
 * // F = typeof a
 * // J = { books: { as: typeof b; title: string } }
 * ```
 *
 * We:
 *
 * - Infer `T = Author` from `F`,
 * - Validate `books` against `Author`,
 * - Validate `title` against `Book`, and
 * - Retain `typeof b` for result typing.
 */
export type CheckJoinInput<F, J> =
  // If J accepts the entire list-or-tree union, its annotation erased the join shape.
  // Queries with no join infer [] and use the list branch below.
  QueryJoinInput extends J
    ? { join?: "join was typed too generically; use `satisfies Query` instead of `: Query`" }
    : // If J is an array, then it's a QueryJoinList and we can return unknown
      [J] extends [readonly unknown[]]
      ? unknown
      : F extends TableFor<infer T extends Entity>
        ? // Validate domain filters and bindings, including extra keys on variables and nested trees.
          { join?: JoinTree<T> & CheckTree<T, J> }
        : // This incompatible type reports why a tree can't start at a non-entity source.
          { join?: "join trees require an entity table in from" };

/**
 * Determines which tables a join tree binds and whether each uses an INNER or LEFT join.
 *
 * Query result types use these entries to identify available tables and columns that can be null.
 *
 * I.e. Author.books.author uses LEFT joins for both Book and its Author because an Author may have no Books.
 */
export type TreeEntries<T extends Entity, J, Nullable extends boolean = false> =
  // If every string is valid keyof J, then we've lost our literal type (i.e. as const) and were
  // passed an opaque type like Record<string, unknown> that doesn't expose its specific relationship
  // keys or table bindings to collect, so just return never.
  string extends keyof J
    ? never
    : // If J has an `as` key, it might be the general JoinTree<T> type, which we check for in the next ternary.
      // If J doesn't have `as`, it can't be the general `JoinTree<T>` so we can jump straight to TreeEntriesImpl.
      "as" extends keyof J
      ? // If `JoinTree<T> extends J`, then we again have a board type. CheckTree will reject this input, but
        // here we stop instead of following every relationship in the domain graph.
        JoinTree<T> extends J
        ? never
        : TreeEntriesImpl<T, J, Nullable>
      : TreeEntriesImpl<T, J, Nullable>;

/** Collects join entries from the relationship keys supplied in this tree node. */
type TreeEntriesImpl<T extends Entity, J, Nullable extends boolean> = {
  [K in keyof J & keyof FieldsOf<T>]: FieldsOf<T>[K] extends {
    kind: "m2o" | "o2m" | "lo2m" | "m2m" | "o2o";
    type: infer U extends Entity;
  }
    ? TreeNodeJoins<
        U,
        Exclude<J[K], undefined>,
        Nullable extends true ? true : FieldsOf<T>[K] extends { kind: "m2o"; nullable: never } ? false : true
      >
    : never;
}[keyof J & keyof FieldsOf<T>];

/**
 * Collects the join entries for this node's table binding and its nested relationships.
 *
 * An `as` binding contributes a LeftJoin or InnerJoin according to Nullable.
 * Without a binding, only nested relationship entries are included; entity, ID, and list filters add none.
 */
type TreeNodeJoins<T extends Entity, J, Nullable extends boolean> =
  // If `J extends Entity | unknown[]`, then it's a leaf entity/id filter, so stop recursing
  J extends Entity | readonly unknown[]
    ? never
    : // If `J extends object`, look for an `as` binding and nested relationships.
      // If `J extends object` is false, this is a scalar filter like "b:1" in `{ books: "b:1" }` and we stop here.
      J extends object
      ?
          | (J extends { readonly as: infer A extends TableFor<T> }
              ? Nullable extends true
                ? LeftJoin<A>
                : InnerJoin<A>
              : never)
          | TreeEntries<T, J, Nullable>
      : never;

/** Rejects broad tree annotations before checking their supplied keys and values. */
type CheckTree<T extends Entity, J> =
  // An entity or a list of entities/IDs is a filter value, so don't check its properties as tree keys.
  J extends Entity | readonly unknown[]
    ? unknown
    : "as" extends keyof J
      ? JoinTree<T> extends J
        ? "join tree bindings were typed too generically; use `satisfies JoinTree<T>` instead of `: JoinTree<T>`"
        : CheckTreeKeys<T, J>
      : CheckTreeKeys<T, J>;

/** Rejects unknown tree keys, including extra properties on objects stored in variables. */
type CheckTreeKeys<T extends Entity, J> = [Exclude<keyof J, keyof JoinTree<T>>] extends [never]
  ? {
      [K in keyof J]: K extends "as"
        ? J[K] extends TableFor<T> | undefined
          ? unknown
          : never
        : K extends keyof JoinTree<T>
          ? K extends keyof FieldsOf<T>
            ? FieldsOf<T>[K] extends { kind: "m2o" | "o2m" | "lo2m" | "m2m" | "o2o"; type: infer U extends Entity }
              ? (J[K] extends JoinTree<T>[K] ? unknown : never) & CheckRelationTree<U, J[K]>
              : J[K] extends JoinTree<T>[K]
                ? unknown
                : never
            : unknown
          : never;
      // Report the error on the tree object; intersecting a message with a boolean field would collapse to never.
    }
  : `unknown join tree field '${Exclude<keyof J, keyof JoinTree<T>> & string}'`;

/** Checks each optional relationship alternative without treating entities or exclusion filters as trees. */
type CheckRelationTree<T extends Entity, J> = J extends object
  ? "ne" extends keyof J
    ? unknown
    : CheckTree<T, J>
  : unknown;

/**
 * Walks domain relationship filters into ordinary SQL joins and WHERE predicates.
 * Handles remain query-local; no SQL aliases or caller objects are changed.
 * I.e. Author.books.author emits Book before its Author, even if only the final Author has an as binding.
 */
export function compileJoinTree(from: unknown, tree: unknown): { joins: QueryJoin[]; condition: QueryCondition } {
  if (!isTable(from)) fail("Join trees require an entity table in from");
  const joins: QueryJoin[] = [];
  const conditions: QueryCondition[] = [];
  const bound = new Set<object>([getTableMgmt(from)]);
  visitTree(from, tree, joins, conditions, bound);
  return { joins, condition: { and: conditions } };
}

/**
 * Compiles one node, leaving relationship conditions in WHERE rather than ON.
 * Each relationship gets one target handle; reusing a bound handle would merge distinct paths.
 * Owning-reference ID filters stay on the FK, while collection ID filters use the joined primary key.
 */
function visitTree(
  source: TableFor<Entity>,
  tree: unknown,
  joins: QueryJoin[],
  conditions: QueryCondition[],
  bound: Set<object>,
): void {
  if (!isTreeObject(tree)) fail("Expected a join tree object");
  const mgmt = getTableMgmt(source);
  if (tree.as !== undefined && tree.as !== source) fail("Join tree root as must be the same table handle as from");
  for (const [key, value] of Object.entries(tree)) {
    if (key === "as") continue;
    const field = mgmt.meta.allFields[key] ?? fail(`Unknown join tree field ${mgmt.meta.type}.${key}`);
    if (!(key in mgmt.meta.fields)) fail(`Join trees do not support inherited field ${mgmt.meta.type}.${key}`);
    if (field.kind === "poly") fail(`Join trees do not support polymorphic field ${mgmt.meta.type}.${key}`);
    if (["m2o", "o2m", "lo2m", "m2m", "o2o"].includes(field.kind)) {
      if (value === undefined) continue;
      if (field.kind === "m2o" && !isTreeObject(value)) {
        // Avoid joining the related table; add the condition directly to the FK column.
        conditions.push(tableWhere(mgmt, { [key]: value }));
        continue;
      }
      if (field.kind === "m2o" && isTreeObject(value) && Object.hasOwn(value, "ne")) {
        // Exclusion filters also apply directly to the FK column without joining the related table.
        conditions.push(tableWhere(mgmt, { [key]: value }));
        continue;
      }
      // The field-kind check above establishes the relationship metadata and factory shape.
      if (!("otherMetadata" in field)) fail(`Unsupported join tree field ${mgmt.meta.type}.${key}`);
      const meta = field.otherMetadata();
      const target = isTreeObject(value) && value.as !== undefined ? value.as : newTableProxy(meta.cstr);
      if (!isTable(target) || getTableMgmt(target).meta !== meta) {
        fail(`Join tree binding for ${mgmt.meta.type}.${key} must be a ${meta.type} table`);
      }
      const identity = getTableMgmt(target);
      if (bound.has(identity))
        fail(`Join tree table ${meta.type} is bound more than once; create a separate table handle`);
      bound.add(identity);
      const relation = (source as unknown as Record<string, CollectionJoin<Entity>>)[key];
      joins.push(relation.as(target));
      // Recurse into nested relationship filters, e.g. `{ books: { title: "One" } }`.
      // A `{ ne: ... }` object instead filters the joined entity's ID, so handle it like an ID or entity value.
      // We don't have to handle other keys like `gt`, etc. b/c we know this is an entity filter, not a value filter.
      if (isTreeObject(value) && !Object.hasOwn(value, "ne")) {
        visitTree(target, value, joins, conditions, bound);
      } else {
        conditions.push(tableEntityWhere(identity, value));
      }
    } else {
      conditions.push(tableWhere(mgmt, { [key]: value }));
    }
  }
}

/** Separates nested relationship objects from entity, ID, and list filters. */
function isTreeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isEntity(value);
}
