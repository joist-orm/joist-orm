import type { DriverQueryResult } from "src/drivers/Driver.ts";
import { type Entity, isEntity } from "src/Entity.ts";
import type { IdOf } from "src/EntityManager.ts";
import type { EntityMetadata } from "src/EntityMetadata.ts";
import { keyToTaggedId, toTaggedId } from "src/keys.ts";
import type { SqlCondition } from "src/queries/conditions.ts";
import { AliasAssigner } from "src/queries/sql/AliasAssigner.ts";
import {
  type CustomColumnInputs,
  type CustomColumnValue,
  type CustomColumnsOf,
  type CustomTableFor,
  type CustomTableMgmt,
} from "src/queries/sql/custom.ts";
import { type ExprBrand, type ExprLike, type SqlFragment, asNode, exprBrand, isExpr } from "src/queries/sql/Expr.ts";
import { kq, safeKq } from "src/queries/sql/keywords.ts";
import {
  type CheckReadQuery,
  type CheckScope,
  type CheckSetQuery,
  Ctx,
  type EntityHydrator,
  type NameOf,
  type Plan,
  type Query,
  type QueryJoinInput,
  type QueryRow,
  type ReadQueryRow,
  type SetOperand,
  type SetOperation,
  type SetQuery,
  type Subquery,
  type WithInput,
  conditionToSql,
  entityQueryBrand,
  injectedConditions,
  isReadQueryValue,
  parseNestedQuery,
  parseUserQuery,
  projectionToSql,
  pruneCtes,
  registerCtes,
  subqueryBrand,
  withFragment,
} from "src/queries/sql/query.ts";
import {
  type TableFor,
  getTableMgmt,
  isCustomTable,
  isEntityTable,
  isTable,
  tableMgmt,
  tableSqlName,
} from "src/queries/sql/Tables.ts";
import type { Column } from "src/serde/columns.ts";
import type { ColumnsOf, TypeMapEntry } from "src/typeMap.ts";
import { fail } from "src/utils.ts";

/** The native command count and decoded rows from one immediate SQL statement. */
export interface ExecuteResult<R> {
  rowCount: number;
  rows: R[];
}

/** A mutation's RETURNING projection: one SQL expression or a named object of expressions. */
export type MutationReturning = (ExprLike<unknown> | Readonly<Record<string, ExprLike<unknown>>>) & {
  readonly [tableMgmt]?: never;
  readonly [subqueryBrand]?: never;
  readonly [entityQueryBrand]?: never;
};

/** SQL INSERT inputs, based on physical storage rather than entity creation options. */
export type InsertValues<T extends Entity> = {
  [K in RequiredInsertKey<T>]: Assignment<T, K>;
} & {
  [K in Exclude<InsertKey<T>, RequiredInsertKey<T>>]?: Assignment<T, K> | undefined;
};

/** SQL UPDATE inputs include persisted derived columns, but never primary keys. */
export type UpdateValues<T extends Entity> = {
  [K in UpdateKey<T>]?: Assignment<T, K> | undefined;
};

/** A reusable INSERT POJO; use a concrete Q for annotated INSERT SELECT source checking. */
export type InsertStatement<
  T extends Entity,
  R extends MutationReturning | undefined = MutationReturning | undefined,
  Q extends SetOperand = Query<InsertProjection<T>, []> | Subquery<InsertSourceRow<T>, string>,
> = {
  readonly insert: MutationTarget<T>;
  readonly returning?: R;
  readonly update?: never;
  readonly delete?: never;
  readonly set?: never;
  readonly where?: never;
  readonly allowAll?: never;
  readonly softDeletes?: never;
  /** CTEs to add to a `WITH` before the INSERT; see `Clauses.with`. */
  readonly with?: WithInput;
} & NoMutationReadClauses &
  (
    | { readonly values: readonly InsertValues<T>[]; readonly from?: never }
    | { readonly from: Q & CheckInsertSource<T, Q>; readonly values?: never }
  );

/** A reusable guarded UPDATE POJO. Undefined assignments leave existing columns unchanged. */
export type UpdateStatement<
  T extends Entity,
  R extends MutationReturning | undefined = MutationReturning | undefined,
> = {
  readonly update: MutationTarget<T>;
  readonly set: UpdateValues<T>;
  readonly returning?: R;
  readonly insert?: never;
  readonly delete?: never;
  readonly values?: never;
  readonly from?: never;
  /** CTEs to add to a `WITH` before the UPDATE; see `Clauses.with`. */
  readonly with?: WithInput;
} & MutationFilter &
  NoMutationReadClauses;

/** A reusable guarded physical DELETE POJO, not an ORM soft delete. */
export type DeleteStatement<
  T extends Entity,
  R extends MutationReturning | undefined = MutationReturning | undefined,
> = {
  readonly delete: MutationTarget<T>;
  readonly returning?: R;
  readonly insert?: never;
  readonly update?: never;
  readonly values?: never;
  readonly from?: never;
  readonly set?: never;
  /** CTEs to add to a `WITH` before the DELETE; see `Clauses.with`. */
  readonly with?: WithInput;
} & MutationFilter &
  NoMutationReadClauses;

/** Public statement annotations retain the target's physical field policy. */
export type MutationStatement<
  T extends Entity,
  R extends MutationReturning | undefined = MutationReturning | undefined,
> = InsertStatement<T, R> | UpdateStatement<T, R> | DeleteStatement<T, R>;

/** Inference starts with the literal POJO; CheckMutation checks its target and every supplied key. */
export type MutationInput = (
  | { readonly insert: TableFor<Entity>; readonly values: readonly object[]; readonly from?: never }
  | { readonly insert: TableFor<Entity>; readonly from: SetOperand; readonly values?: never }
  | { readonly update: TableFor<Entity>; readonly set: object }
  | { readonly delete: TableFor<Entity> }
  | {
      readonly insert: CustomTableFor;
      readonly values: readonly object[];
      readonly from?: never;
    }
  | { readonly insert: CustomTableFor; readonly from: SetOperand; readonly values?: never }
  | { readonly update: CustomTableFor; readonly set: object }
  | { readonly delete: CustomTableFor }
) & { readonly returning?: MutationReturning; readonly with?: WithInput } & MutationFilter;

/** Without RETURNING the row type is never; scalar expressions produce scalar rows. */
export type MutationRow<M> = M extends { readonly returning?: infer R }
  ? R extends MutationReturning
    ? R extends ExprLike<unknown>
      ? QueryRow<R>
      : { -readonly [K in keyof QueryRow<R>]: QueryRow<R>[K] }
    : never
  : never;

/** Checks nonliteral statements as well as fresh literals without widening their inferred result. */
export type CheckMutation<M> = M extends unknown
  ? [CustomColumnsOf<TargetTable<M>>] extends [never]
    ? TargetEntity<M> extends infer T extends Entity
      ? TypeMapEntry<T, "supportsEmExecute"> extends true
        ? { readonly [K in keyof M]: K extends MutationClause<M> ? unknown : never } & {
            readonly returning?: M extends { readonly returning?: infer R }
              ? CheckReturning<R, NameOf<TargetTable<M>>>
              : never;
          } & (
              | (M extends { readonly values: infer V extends readonly unknown[] }
                  ? { readonly values: CheckValues<T, V> }
                  : never)
              | (M extends { readonly from: infer Q extends SetOperand }
                  ? { readonly from: CheckInsertSource<T, Q> }
                  : never)
              | (M extends { readonly set: infer V }
                  ? { readonly set: CheckAssignments<V, UpdateValues<T>, NameOf<TargetTable<M>>> }
                  : never)
              | (M extends { readonly delete: unknown } ? unknown : never)
            )
        : "SQL mutations require a supported non-inherited target and regenerated metadata"
      : never
    : CheckCustomMutation<M>
  : never;

/** Classifies mutation roots before EntityManager applies write permissions, including malformed roots. */
export function isMutation(arg: unknown): boolean {
  return (
    typeof arg === "object" &&
    arg !== null &&
    !isReadQueryValue(arg) &&
    ["insert", "update", "delete"].some((key) => key in arg)
  );
}

/**
 * Compiles one immediate statement using the read compiler's scopes, projections, and codecs.
 * INSERT SELECT keeps source rows in PostgreSQL; only RETURNING rows pass through JS decoders.
 * An undefined plan represents a validated standalone empty VALUES array, not DEFAULT VALUES.
 */
export function parseStatement(arg: unknown): Plan | undefined {
  if (!isMutation(arg)) return parseUserQuery(arg);
  const statement = arg as Record<string, unknown>;
  const roots = ["insert", "update", "delete"].filter((key) => key in statement);
  if (roots.length !== 1) fail("A mutation requires exactly one insert, update, or delete root");
  const operation = roots[0];
  const allowed =
    operation === "insert"
      ? ["insert", "values", "from", "returning", "with"]
      : [
          operation,
          "where",
          "allowAll",
          "softDeletes",
          "returning",
          "with",
          ...(operation === "update" ? ["set"] : []),
        ];
  checkPojo(statement, allowed, `SQL ${operation}`);
  const target = statement[operation];
  if (!isTable(target)) fail("A mutation target must be a table");
  const mgmt = getTableMgmt(target);
  const meta = isEntityTable(target) ? getTableMgmt(target).meta : undefined;
  const custom = isCustomTable(target) ? getTableMgmt(target) : undefined;
  if (meta) {
    if (meta.inheritanceType || meta.baseType || meta.baseTypes.length || meta.subTypes.length) {
      fail("SQL mutations do not support CTI/STI targets or inherited table families");
    }
    if (meta.supportsEmExecute !== true)
      fail(`SQL mutations require supported physical metadata for ${meta.type}; run codegen`);
    for (const field of Object.values(meta.columns)) requireColumnMetadata(meta, field);
  } else if (statement.softDeletes !== undefined) {
    fail("Custom table mutations do not support softDeletes");
  }
  const fields = Object.entries(meta?.columns ?? custom!.columns);
  const assigner = new AliasAssigner();
  // A CTE is in scope for the whole statement, so its scope is the parent of every other one here. It
  // deliberately holds no target alias, which is what lets INSERT VALUES cells and the INSERT SELECT
  // source read the CTEs without also seeing the row being written.
  const withCtx = new Ctx(assigner, undefined);
  const ctes = registerCtes(statement, withCtx, assigner);
  // Aliases the rest of the statement reads, so an unread CTE prunes like it does on a read query.
  const refs: string[] = [];
  const ctx = new Ctx(assigner, withCtx);
  const alias = assigner.getAlias(mgmt.tableName);
  ctx.register(mgmt, alias);
  const returning = statement.returning === undefined ? undefined : projectionToSql(statement.returning, ctx);
  if (returning) for (const select of returning.selects) refs.push(...select.refs);
  let sql = `${operation === "delete" ? "DELETE FROM" : operation.toUpperCase() + (operation === "insert" ? " INTO" : "")} ${tableSqlName(mgmt)} AS ${kq(alias)}`;
  const bindings: unknown[] = [];
  if (operation === "insert") {
    if ("values" in statement === "from" in statement) fail("INSERT requires exactly one of values or from");
    const required = fields.filter(([, column]) => column.insert === "required");
    if ("values" in statement) {
      if (!Array.isArray(statement.values)) fail("INSERT values must be an array of field POJOs");
      const rows = statement.values;
      // A VALUES cell *is* the new row, so there is no existing row for it to read: this scope skips
      // the `ctx.register(mgmt, alias)` above, so a cell naming the target fails instead of emitting a
      // `b` with no FROM clause. I.e. an UPDATE can say `set: { title: b.title }`; an INSERT cannot.
      // A value subquery still works, because it brings its own sources, and the parent here is the CTE
      // scope rather than `ctx`, so a cell can read a `with` entry but not the row being written.
      const valuesCtx = new Ctx(assigner, withCtx);
      const entries = rows.map((row) =>
        meta ? assignments(meta, row, "insert") : customAssignments(custom!, row, "insert"),
      );
      for (const row of entries) {
        for (const [key] of required) {
          if (!row.some((entry) => entry[0] === key)) fail(`INSERT requires ${meta?.type ?? custom!.tableName}.${key}`);
        }
      }
      if (rows.length === 0) return undefined;
      const keys = fields
        .filter(([key]) => entries.some((row) => row.some((entry) => entry[0] === key)))
        .map(([key, field]) => [key, field.columnName] as const);
      sql += ` (${keys.map(([, column]) => kq(column)).join(", ")}) VALUES `;
      sql += entries
        .map((row) => {
          const cells = keys.map(([key]) => {
            const entry = row.find((entry) => entry[0] === key);
            if (!entry) return "DEFAULT";
            const cell = meta
              ? assignmentToSql(meta, writableField(meta, key, "insert"), entry[1], valuesCtx)
              : customAssignmentToSql(custom!, customWritableField(custom!, key, "insert"), entry[1], valuesCtx);
            bindings.push(...cell.bindings);
            refs.push(...cell.refs);
            return cell.sql;
          });
          return `(${cells.join(", ")})`;
        })
        .join(", ");
    } else {
      const source = parseNestedQuery(statement.from, withCtx, assigner);
      if (source.output.kind !== "pojo") fail("INSERT SELECT requires named POJO output columns");
      const columns = source.output.columns;
      for (const [key] of required) {
        if (!columns.some((column) => column[0] === key)) {
          fail(`INSERT requires ${meta?.type ?? custom!.tableName}.${key}`);
        }
      }
      for (const [key, expr] of columns) {
        const field = meta ? writableField(meta, key, "insert") : customWritableField(custom!, key, "insert");
        const left = field.outputType;
        const right = expr.outputType;
        if (
          !left ||
          !right ||
          left.dbType !== right.dbType ||
          left.domain !== right.domain ||
          left.idMeta !== right.idMeta
        ) {
          fail(`INSERT SELECT ${meta?.type ?? custom!.tableName}.${key} has incompatible or unknown storage codecs`);
        }
        if (!field.sqlNullable && expr.sqlNullable === true)
          fail(`INSERT SELECT ${meta?.type ?? custom!.tableName}.${key} cannot accept a nullable output`);
      }
      const keys = fields
        .filter(([key]) => columns.some((column) => column[0] === key))
        .map(([key, field]) => [key, field.columnName] as const);
      const sourceAlias = safeKq(assigner.getLiteralAlias("sq"));
      sql += ` (${keys.map(([, column]) => kq(column)).join(", ")}) SELECT ${keys.map(([key]) => `${sourceAlias}.${safeKq(key)}`).join(", ")} FROM (${source.sql}) AS ${sourceAlias}`;
      bindings.push(...source.bindings);
      refs.push(...source.outerRefs);
    }
  } else {
    if (statement.allowAll !== undefined && typeof statement.allowAll !== "boolean") fail("allowAll must be a boolean");
    if (
      statement.softDeletes !== undefined &&
      statement.softDeletes !== "include" &&
      statement.softDeletes !== "exclude"
    )
      fail("softDeletes must be 'include' or 'exclude'");
    const whereCondition = mutationCondition(statement.where, ctx);
    if (Object.hasOwn(statement, "where") && !whereCondition && statement.allowAll !== true)
      fail("UPDATE and DELETE require allowAll: true when a supplied where is undefined or fully pruned");
    if (operation === "update") {
      const entries = meta
        ? assignments(meta, statement.set, "update")
        : customAssignments(custom!, statement.set, "update");
      sql +=
        " SET " +
        entries
          .map((entry) => {
            const [key, value] = entry;
            const field = meta ? writableField(meta, key, "update") : customWritableField(custom!, key, "update");
            const cell = meta
              ? assignmentToSql(meta, field, value, ctx)
              : customAssignmentToSql(custom!, field, value, ctx);
            bindings.push(...cell.bindings);
            refs.push(...cell.refs);
            return `${kq(field.columnName)} = ${cell.sql}`;
          })
          .join(", ");
    }
    const injected = meta
      ? conditionToSql({ and: injectedConditions({ meta, alias }, statement.softDeletes ?? "exclude") }, ctx, true)
      : undefined;
    const conditions = [whereCondition, injected].filter((condition) => condition !== undefined);
    if (conditions.length) {
      sql += ` WHERE ${conditions.map((condition) => `(${condition.sql})`).join(" AND ")}`;
      for (const condition of conditions) {
        bindings.push(...condition.bindings);
        refs.push(...condition.refs);
      }
    }
  }
  if (returning) {
    sql += ` RETURNING ${returning.selects.map((select) => select.sql).join(", ")}`;
    for (const select of returning.selects) bindings.push(...select.bindings);
  }
  const keptCtes = pruneCtes(ctes, new Set(refs));
  if (keptCtes.length > 0) {
    const clause = withFragment(keptCtes);
    sql = clause.sql + sql;
    bindings.unshift(...clause.bindings);
  }
  return {
    sql,
    bindings,
    outerRefs: [],
    output: returning?.output ?? { kind: "pojo", columns: [] },
    decodeRows: returning?.decodeRows ?? (() => []),
  };
}

/** Retains native counts even when no rows return, and propagates decoding failures after execution. */
export function decodeStatementResult(
  em: EntityHydrator,
  plan: Plan,
  result: DriverQueryResult,
): ExecuteResult<unknown> {
  if (typeof result.rowCount !== "number" || !Number.isInteger(result.rowCount) || result.rowCount < 0)
    fail("The driver did not return a numeric command rowCount");
  return { rowCount: result.rowCount, rows: plan.decodeRows(em, result.rows) };
}

/** An entity table whose generated metadata permits direct SQL mutations. */
type MutationTarget<T extends Entity> = TableFor<T> &
  (TypeMapEntry<T, "supportsEmExecute"> extends true ? unknown : never);

/** Shared filtering and full-table consent clauses for UPDATE and DELETE. */
type MutationFilter = {
  /**
   * An `{ and: [...] }` or `{ or: [...] }` group, a boolean expression, or a bare condition such as `a.age.gte(18)`.
   *
   * Arrays are shorthand for `{ and: [...] }`; undefined conditions are pruned.
   */
  readonly where?: SqlCondition | ExprLike<boolean> | readonly (SqlCondition | undefined)[];
  /** Allows a supplied where to be undefined or fully pruned; unnecessary when where is omitted. */
  readonly allowAll?: boolean;
  readonly softDeletes?: "include" | "exclude";
};

/** Read-only query clauses that mutations explicitly reject. */
type NoMutationReadClauses = Partial<
  Record<
    | "select"
    | "join"
    | "groupBy"
    | "having"
    | "orderBy"
    | "limit"
    | "offset"
    | "distinct"
    | "pruneJoins"
    | "as"
    | "union"
    | "unionAll"
    | "intersect"
    | "intersectAll"
    | "except"
    | "exceptAll"
    | "ctes"
    | "using"
    | "onConflict",
    never
  >
>;

/** Column keys allowed in INSERT, i.e. Book's optional `id` and required `authorId`. */
type InsertKey<T> = {
  [K in keyof ColumnsOf<T>]: ColumnsOf<T>[K] extends { insert: "required" | "optional" } ? K : never;
}[keyof ColumnsOf<T>];

/** Column keys that each INSERT row must supply, i.e. Book's `authorId` despite its ORM default. */
type RequiredInsertKey<T> = {
  [K in keyof ColumnsOf<T>]: ColumnsOf<T>[K] extends { insert: "required" } ? K : never;
}[keyof ColumnsOf<T>];

/** Column keys allowed in UPDATE SET, i.e. Book's `title` and `authorId`, but not `id`. */
type UpdateKey<T> = {
  [K in keyof ColumnsOf<T>]: ColumnsOf<T>[K] extends { update: true } ? K : never;
}[keyof ColumnsOf<T>];

/** A column's domain value before SQL nullability is added, i.e. Book's `id` is BookId and `authorId` is AuthorId. */
type DomainValue<T, K extends keyof ColumnsOf<T>> = K extends "id"
  ? IdOf<T>
  : ColumnsOf<T>[K] extends { entity: infer U }
    ? IdOf<U>
    : ColumnsOf<T>[K] extends { type: infer V }
      ? V
      : never;

/** A modeled column's domain value with SQL nullability applied. */
type SqlValue<T, K extends keyof ColumnsOf<T>> =
  | DomainValue<T, K>
  | (ColumnsOf<T>[K] extends { nullable: true } ? null : never);

/** A modeled-column value, entity reference, or SQL expression that produces one. */
type Assignment<T, K extends keyof ColumnsOf<T>> =
  | SqlValue<T, K>
  | ExprLike<SqlValue<T, K>>
  | (K extends "id" ? never : ColumnsOf<T>[K] extends { entity: infer U } ? U : never);

/** A custom column's declared value with SQL nullability applied. */
type CustomSqlValue<I> = CustomColumnValue<I> | (I extends { nullable: true } ? null : never);

/** A custom-column value or SQL expression that produces one. */
type CustomAssignment<I> = CustomSqlValue<I> | ExprLike<CustomSqlValue<I>>;

/** Custom-column keys accepted by INSERT, excluding generated columns. */
type CustomInsertKey<C extends CustomColumnInputs> = {
  [K in keyof C]: C[K] extends { generated: true } ? never : K;
}[keyof C];

/** Custom-column keys each INSERT row must supply because they have no default and are not nullable. */
type CustomRequiredInsertKey<C extends CustomColumnInputs> = {
  [K in CustomInsertKey<C>]: C[K] extends { nullable: true } | { hasDefault: true } ? never : K;
}[CustomInsertKey<C>];

/** Custom-column keys accepted by UPDATE, excluding generated columns and the physical primary key. */
type CustomUpdateKey<C extends CustomColumnInputs> = {
  [K in keyof C]: C[K] extends { generated: true }
    ? never
    : K extends "id"
      ? never
      : C[K] extends { columnName: "id" }
        ? never
        : K;
}[keyof C];

/** Values accepted by INSERT for a custom table's declared columns. */
type CustomInsertValues<C extends CustomColumnInputs> = {
  [K in CustomRequiredInsertKey<C>]: CustomAssignment<C[K]>;
} & {
  [K in Exclude<CustomInsertKey<C>, CustomRequiredInsertKey<C>>]?: CustomAssignment<C[K]> | undefined;
};

/** Assignments accepted by UPDATE for a custom table's writable columns. */
type CustomUpdateValues<C extends CustomColumnInputs> = {
  [K in CustomUpdateKey<C>]?: CustomAssignment<C[K]> | undefined;
};

/** Named row shape that an INSERT SELECT source must produce for a custom table. */
type CustomInsertSourceRow<C extends CustomColumnInputs> = {
  [K in CustomRequiredInsertKey<C>]: CustomSqlValue<C[K]>;
} & {
  [K in Exclude<CustomInsertKey<C>, CustomRequiredInsertKey<C>>]?: CustomSqlValue<C[K]>;
};

/** Named row shape that an entity INSERT SELECT source must produce. */
type InsertSourceRow<T> = { [K in RequiredInsertKey<T>]: SqlValue<T, K> } & {
  [K in Exclude<InsertKey<T>, RequiredInsertKey<T>>]?: SqlValue<T, K>;
};

/** Named expression projection accepted from an entity INSERT SELECT source. */
type InsertProjection<T> = { [K in RequiredInsertKey<T>]: ExprLike<SqlValue<T, K>> } & {
  [K in Exclude<InsertKey<T>, RequiredInsertKey<T>>]?: ExprLike<SqlValue<T, K>>;
};

/** Collects the keys from every member of a union instead of only their shared keys. */
type UnionKeys<V> = V extends unknown ? keyof V : never;

/** Collects every alternative before scope checking; a valid branch cannot hide an unrelated alias. */
type UnionValue<V, K extends PropertyKey> = V extends unknown ? (K extends keyof V ? V[K] : never) : never;

/** Extracts the source names carried by a SQL expression. */
type ExprSource<V> = V extends { readonly [exprBrand]: ExprBrand<unknown, infer Src> } ? Src : never;

/** Rejects expressions that reference tables outside the statement's allowed scope. */
type CheckExprScope<V, Scope> =
  string extends ExprSource<V>
    ? unknown
    : [Exclude<ExprSource<V>, Scope>] extends [never]
      ? unknown
      : "Expression source is not in the statement scope";

/** Extracts each expression from a scalar or named RETURNING projection. */
type ReturningExpr<R> = R extends ExprLike<unknown> ? R : R extends undefined ? never : R[keyof R];

/** Detects an empty named RETURNING projection. */
type EmptyReturning<R> = R extends object ? (keyof R extends never ? true : false) : false;

/** Rejects empty RETURNING objects and expressions outside the target scope. */
type CheckReturning<R, Scope> = true extends EmptyReturning<R> ? never : CheckExprScope<ReturningExpr<R>, Scope>;

/** Validates assignment keys, values, and expression sources without distributing union inputs. */
type CheckAssignments<V, Allowed, Scope> = [Exclude<UnionKeys<V>, keyof Allowed>] extends [never]
  ? Allowed & {
      [K in UnionKeys<V>]?: CheckExprScope<UnionValue<V, K>, Scope>;
    }
  : "SQL assignments have unknown target fields";

/** Checks every entity INSERT row in a readonly collection against writable columns. */
type CheckValues<T extends Entity, V extends readonly unknown[]> = readonly CheckAssignments<
  V[number],
  InsertValues<T>,
  never
>[];

/**
 * Checks a custom-table mutation against its declared primitive columns.
 *
 * Only clauses for the selected operation are allowed, and `softDeletes` is rejected because there is no entity
 * policy. Assignments use declaration keys and honor nullability, defaults, and generated columns. INSERT VALUES
 * cannot read the target row, while UPDATE SET and RETURNING can. INSERT SELECT must be a valid named read with all
 * required columns and compatible declared value types; runtime checks also compare its SQL codecs and nullability.
 */
type CheckCustomMutation<M> = {
  // Reject clauses outside the selected operation, plus softDeletes because custom tables have no entity policy.
  readonly [K in keyof M]: K extends MutationClause<M> ? (K extends "softDeletes" ? never : unknown) : never;
} & {
  readonly returning?: M extends { readonly returning?: infer R } ? CheckReturning<R, NameOf<TargetTable<M>>> : never;
} &
  // INSERT VALUES checks every row against the custom table's writable columns.
  (
    | (M extends { readonly values: infer V extends readonly unknown[] }
        ? { readonly values: CheckCustomValues<CustomColumnsOf<TargetTable<M>>, V> }
        : never)
    // INSERT SELECT checks the source's names, values, and expression scopes.
    | (M extends { readonly from: infer Q extends SetOperand }
        ? { readonly from: CheckCustomInsertSource<CustomColumnsOf<TargetTable<M>>, Q> }
        : never)
    // UPDATE checks assignments against writable columns and permits target-scoped expressions.
    | (M extends { readonly set: infer V }
        ? {
            readonly set: CheckAssignments<
              V,
              CustomUpdateValues<CustomColumnsOf<TargetTable<M>>>,
              NameOf<TargetTable<M>>
            >;
          }
        : never)
    // DELETE has no assignments or source that needs further type checking.
    | (M extends { readonly delete: unknown } ? unknown : never)
  );

/** Checks every custom INSERT row in a readonly collection against declared writable columns. */
type CheckCustomValues<C extends CustomColumnInputs, V extends readonly unknown[]> = readonly CheckAssignments<
  V[number],
  CustomInsertValues<C>,
  never
>[];

/** Checks a custom INSERT SELECT's named outputs, required columns, values, and read source. */
type CheckCustomInsertSource<C extends CustomColumnInputs, Q> = SetOperand extends Q
  ? "INSERT source type lost its select keys; use `satisfies Query` or `satisfies SetQuery` instead of a type annotation"
  : ReadQueryRow<Q> extends CustomInsertSourceRow<C>
    ? Exclude<UnionKeys<ReadQueryRow<Q>>, CustomInsertKey<C>> extends never
      ? CheckReadQuery<Q> &
          CheckSourceScope<Q> &
          (Q extends SetQuery<readonly SetOperand[]> ? CheckSetQuery<Q> : unknown)
      : "INSERT SELECT has unknown target fields"
    : "INSERT SELECT requires compatible values for all SQL-required fields";

/** Checks every SELECT expression against the tables visible within its read-query branch. */
type CheckSourceScope<Q> = Q extends { readonly select: infer S; readonly from: infer F }
  ? CheckScope<S, F, "join" extends keyof Q ? Extract<Q[keyof Q & "join"], QueryJoinInput> : []>
  : {
      [K in keyof Q]: K extends SetOperation
        ? Q[K] extends readonly unknown[]
          ? { [I in keyof Q[K]]: CheckSourceScope<Q[K][I]> }
          : unknown
        : unknown;
    };

/** Checks an entity INSERT SELECT's named outputs, required columns, values, and read source. */
type CheckInsertSource<T, Q extends SetOperand> = SetOperand extends Q
  ? "INSERT source type lost its select keys; use `satisfies Query` or `satisfies SetQuery` instead of a type annotation"
  : ReadQueryRow<Q> extends InsertSourceRow<T>
    ? Exclude<UnionKeys<ReadQueryRow<Q>>, InsertKey<T>> extends never
      ? CheckReadQuery<Q> &
          CheckSourceScope<Q> &
          (Q extends SetQuery<readonly SetOperand[]> ? CheckSetQuery<Q> : unknown)
      : "INSERT SELECT has unknown target fields"
    : "INSERT SELECT requires compatible values for all SQL-required fields";

/** Extracts the entity type from any mutation target clause. */
type TargetEntity<M> = M extends
  | { readonly insert: TableFor<infer T> }
  | { readonly update: TableFor<infer T> }
  | { readonly delete: TableFor<infer T> }
  ? T
  : never;

/** Extracts the table handle from any mutation target clause. */
type TargetTable<M> = M extends
  | { readonly insert: infer A }
  | { readonly update: infer A }
  | { readonly delete: infer A }
  ? A
  : never;

/** Clauses permitted by the selected INSERT, UPDATE, or DELETE operation. */
type MutationClause<M> =
  | "returning"
  | "with"
  | (M extends { readonly insert: unknown }
      ? "insert" | (M extends { readonly values: unknown } ? "values" : "from")
      : "where" | "allowAll" | "softDeletes" | (M extends { readonly update: unknown } ? "update" | "set" : "delete"));

/** SQL mutations require complete physical metadata. */
function requireColumnMetadata(meta: EntityMetadata, column: Column): void {
  if (
    typeof column.sqlNullable !== "boolean" ||
    typeof column.hasDefault !== "boolean" ||
    typeof column.isGenerated !== "boolean"
  )
    fail(`Missing physical metadata for ${meta.type}.${column.columnName}; run codegen`);
}

/** Validates every supplied key, including undefined fields, before pruning omitted values. */
function assignments(meta: EntityMetadata, value: unknown, operation: "insert" | "update"): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value) || isExpr(value) || isEntity(value))
    fail(`${operation} assignments must be a field POJO`);
  const entries = Object.entries(value);
  for (const [key] of entries) writableField(meta, key, operation);
  checkPojo(value, Object.keys(meta.columns), `${operation} assignments`);
  const defined = entries.filter((entry) => entry[1] !== undefined);
  if (!defined.length) fail(`${operation} requires at least one defined field; empty rows/sets are not DEFAULT VALUES`);
  return defined;
}

/** Validates assignment keys against a custom table's declared writable columns. */
function customAssignments(
  table: CustomTableMgmt,
  value: unknown,
  operation: "insert" | "update",
): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value) || isExpr(value) || isEntity(value)) {
    fail(`${operation} assignments must be a field POJO`);
  }
  const entries = Object.entries(value);
  for (const [key] of entries) customWritableField(table, key, operation);
  checkPojo(value, Object.keys(table.columns), `${operation} assignments`);
  const defined = entries.filter((entry) => entry[1] !== undefined);
  if (!defined.length) fail(`${operation} requires at least one defined field; empty rows/sets are not DEFAULT VALUES`);
  return defined;
}

/** Applies physical write restrictions declared by `declareTable`. */
function customWritableField(table: CustomTableMgmt, key: string, operation: "insert" | "update"): Column {
  const column = Object.hasOwn(table.columns, key) ? table.columns[key] : undefined;
  if (!column) fail(`Unsupported SQL mutation field ${table.tableName}.${key}`);
  if (operation === "update" ? !column.update : column.insert === "never") {
    fail(`Unsupported SQL mutation field ${table.tableName}.${key}`);
  }
  return column;
}

/** Applies physical write restrictions, not ORM-derived, protected, or business-immutable flags. */
function writableField(meta: EntityMetadata, key: string, operation: "insert" | "update"): Column {
  const column = Object.hasOwn(meta.columns, key) ? meta.columns[key] : undefined;
  if (!column) fail(`Unsupported SQL mutation field ${meta.type}.${key}`);
  requireColumnMetadata(meta, column);
  if (operation === "update" && key === "id") fail("UPDATE primary-key assignments are not supported");
  if (column.isGenerated) fail(`Generated field ${meta.type}.${key} is omit-only`);
  if (operation === "update" ? !column.update : column.insert === "never")
    fail(`Unsupported SQL mutation field ${meta.type}.${key}`);
  return column;
}

/**
 * Classifies SQL expressions and SQL NULL before invoking the column's entity-independent write codec.
 * Normalizes public PK/FK ids to internal tagged ids using the target entity's idType.
 */
function assignmentToSql(meta: EntityMetadata, column: Column, value: unknown, ctx: Ctx): SqlFragment {
  if (isExpr(value)) return asNode(value).toSql(ctx);
  if (value === null) {
    if (!column.sqlNullable) fail(`${meta.type}.${column.columnName} is physically NOT NULL`);
    return { sql: "NULL", bindings: [], refs: [] };
  }
  if (column.idMetadata) {
    const other = column.idMetadata();
    if (isEntity(value)) {
      if (column.columnName === "id" || !(value instanceof other.cstr)) fail(`Expected a ${other.type} reference`);
      if (value.isNewEntity || value.idTaggedMaybe === undefined)
        fail(`Cannot reference an unflushed ${other.type}, even with an assigned ID`);
      value = value.idTaggedMaybe;
    } else if (typeof value !== (other.idType === "number" ? "number" : "string")) {
      fail(`Expected a persisted ${other.type} or its ID; nested creation is not supported`);
    } else {
      // Public untagged TEXT ids may contain delimiters or start with the entity tag.
      value =
        other.idType === "untagged-string"
          ? keyToTaggedId(other, value as string)
          : toTaggedId(other, value as string | number);
    }
  }
  if (!column.codec.mapToDbValue)
    fail(`The codec for ${meta.type}.${column.columnName} does not support SQL value writes`);
  return { sql: "?", bindings: [column.mapToDbValue(value)], refs: [] };
}

/** Encodes a custom-table literal through its declared primitive codec. */
function customAssignmentToSql(table: CustomTableMgmt, column: Column, value: unknown, ctx: Ctx): SqlFragment {
  if (isExpr(value)) return asNode(value).toSql(ctx);
  if (value === null) {
    if (!column.sqlNullable) fail(`${table.tableName}.${column.columnName} is physically NOT NULL`);
    return { sql: "NULL", bindings: [], refs: [] };
  }
  return { sql: "?", bindings: [column.mapToDbValue(value)], refs: [] };
}

/** Checks the user predicate independently so metadata filters cannot turn a pruned guard into consent. */
function mutationCondition(value: unknown, ctx: Ctx): SqlFragment | undefined {
  if (isExpr(value)) return asNode(value).toSql(ctx);
  if (Array.isArray(value)) return conditionToSql({ and: value }, ctx, true);
  return conditionToSql(value as SqlCondition | undefined, ctx, true);
}

/** Only own enumerable POJO clauses count as input or explicit full-table consent. */
function checkPojo(value: object, allowed: readonly PropertyKey[], description: string): void {
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    fail(`${description} must be a plain POJO`);
  for (const key of Reflect.ownKeys(value)) {
    if (!allowed.includes(key)) fail(`${description} does not support '${String(key)}'`);
    if (typeof key === "string" && !Object.prototype.propertyIsEnumerable.call(value, key))
      fail(`${description} requires enumerable fields`);
  }
}
