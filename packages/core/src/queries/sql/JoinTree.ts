import { type Entity, isEntity } from "src/Entity.ts";
import type { IdOf } from "src/EntityManager.ts";
import type { InnerJoin, LeftJoin } from "src/queries/sql/Expr.ts";
import type { QueryCondition, QueryJoin, QueryJoinInput, QueryJoinList } from "src/queries/sql/query.ts";
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
 * Filters related entities by ID after joining their table, e.g. `{ books: "b:1" }` filters Book.id to 1.
 *
 * Adapted from em.find's EntityFilter, rather than a direct copy: keeps entity/ID, list,
 * boolean, and ne filters, but omits scopes, find aliases, nested objects, and logical groups.
 * JoinTree supplies nested objects and table bindings separately. Lists can mix entities and IDs,
 * unlike EntityFilter's separate entity[] and ID[] alternatives. Null is always allowed because
 * these relationships use LEFT joins; undefined comes from JoinTree's optional relationship keys.
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
 * QueryArg intersects this constraint into the argument under NoInfer, so it checks F and J
 * after inference rather than changing which types are inferred. Returning unknown adds no constraint.
 *
 * A broadly declared Query uses the entire QueryJoinInput union, so the first branch skips
 * tree-specific validation. Flat lists already have their own entry types and also need no extra check.
 * The tuple-wrapped array check tests J as a whole: distributing over a list-or-tree union would
 * produce unknown for the list branch, swallowing the tree constraint in the resulting union.
 *
 * For a concrete tree, JoinTree<T> supplies the allowed filters and bindings; CheckTree<T, J>
 * checks the supplied keys recursively, including extra keys on variables. A non-entity `from`
 * gets an incompatible join type whose string explains the error; it is not a runtime input option.
 *
 * I.e. with a = table(Author) and b = table(Book):
 * `em.query({ from: a, join: { books: { as: b, title: "One" } }, select: { title: b.title } })`
 * infers F = typeof a and J = { books: { as: typeof b; title: string } }. We infer T = Author
 * from F, validate books against Author and title against Book, and retain typeof b for result typing.
 */
export type CheckJoinInput<F, J> = QueryJoinInput extends J
  ? unknown
  : [J] extends [readonly unknown[]]
    ? unknown
    : F extends TableFor<infer T extends Entity>
      ? { join?: JoinTree<T> & CheckTree<T, J> }
      : { join?: "join trees require an entity table in from" };

/**
 * Resolves literal tree bindings to join types for scope and result nullability.
 * Deferring the extracted entry union avoids expanding recursive constraints in generic query signatures.
 */
export type ResolvedJoins<F, J> = J extends QueryJoinList
  ? J
  : F extends TableFor<infer T extends Entity>
    ? TreeEntries<T, J> extends infer E
      ? readonly Extract<E, QueryJoin>[]
      : never
    : [];

/**
 * Carries nullable ancestors even through nodes without an as binding.
 * I.e. Author.books.author makes the final Author nullable even though Book.author is required.
 * Broad object inputs have no known bindings; only literal trees can supply precise source names.
 * A JoinTree annotation erases those names and can recursively reference itself, so its entries
 * conservatively allow any nullable table instead of walking the entire domain graph.
 */
type TreeEntries<T extends Entity, J, Nullable extends boolean = false> = string extends keyof J
  ? never
  : "as" extends keyof J
    ? JoinTree<T> extends J
      ? LeftJoin<TableFor<Entity>>
      : LiteralTreeEntries<T, J, Nullable>
    : LiteralTreeEntries<T, J, Nullable>;

/** Visits only the relationship keys present in a concrete tree node. */
type LiteralTreeEntries<T extends Entity, J, Nullable extends boolean> = {
  [K in keyof J & keyof FieldsOf<T>]: FieldsOf<T>[K] extends {
    kind: "m2o" | "o2m" | "lo2m" | "m2m" | "o2o";
    type: infer U extends Entity;
  }
    ? TreeNode<
        U,
        Exclude<J[K], undefined>,
        Nullable extends true ? true : FieldsOf<T>[K] extends { kind: "m2o"; nullable: never } ? false : true
      >
    : never;
}[keyof J & keyof FieldsOf<T>];

type TreeNode<T extends Entity, J, Nullable extends boolean> = J extends Entity | readonly unknown[]
  ? never
  : J extends object
    ?
        | (J extends { readonly as: infer A extends TableFor<T> }
            ? Nullable extends true
              ? LeftJoin<A>
              : InnerJoin<A>
            : never)
        | TreeEntries<T, J, Nullable>
    : never;

/** Rejects unknown keys even when a tree is passed through an inferred variable. */
type CheckTree<T extends Entity, J> = J extends Entity | readonly unknown[]
  ? unknown
  : {
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
    };

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
