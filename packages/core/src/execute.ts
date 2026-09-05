import { AliasAssigner } from "./AliasAssigner.ts";
import { type AliasFor, aliasMgmt, getAliasMgmt, isAlias } from "./Aliases.ts";
import { type DriverQueryResult } from "./drivers/Driver.ts";
import { type Entity, isEntity } from "./Entity.ts";
import { type ExpressionCondition } from "./EntityFilter.ts";
import type { IdOf } from "./EntityManager.ts";
import { type EntityMetadata, type Field } from "./EntityMetadata.ts";
import { type ExprBrand, type ExprLike, type SqlFragment, asNode, exprBrand, isExpr } from "./Expr.ts";
import { keyToTaggedId, toTaggedId } from "./keys.ts";
import { kq, safeKq } from "./keywords.ts";
import {
  type CheckReadQuery,
  type CheckScope,
  type CheckSetQuery,
  Ctx,
  type EntityHydrator,
  type NameOf,
  type Plan,
  type Query,
  type QueryJoins,
  type QueryRow,
  type ReadQueryRow,
  type SetOperand,
  type SetOperation,
  type SetQuery,
  type Subquery,
  conditionToSql,
  entityQueryBrand,
  injectedConditions,
  isReadQueryValue,
  parseUserQuery,
  projectionToSql,
  subqueryBrand,
} from "./query.ts";
import { type FieldsOf, type TypeMapEntry } from "./typeMap.ts";
import { fail } from "./utils.ts";

/** The native command count and decoded rows from one immediate SQL statement. */
export interface ExecuteResult<R> {
  rowCount: number;
  rows: R[];
}

/** RETURNING never hydrates entities or exposes a table-shaped read value. */
export type MutationReturning = (ExprLike<unknown> | Readonly<Record<string, ExprLike<unknown>>>) & {
  readonly [aliasMgmt]?: never;
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
} & NoMutationReadClauses &
  (
    | { readonly values: InsertValues<T> | readonly InsertValues<T>[]; readonly from?: never }
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
} & MutationFilter &
  NoMutationReadClauses;

/** Public statement annotations retain the target's physical field policy. */
export type MutationStatement<
  T extends Entity,
  R extends MutationReturning | undefined = MutationReturning | undefined,
> = InsertStatement<T, R> | UpdateStatement<T, R> | DeleteStatement<T, R>;

/** Inference starts with the literal POJO; CheckMutation checks its target and every supplied key. */
export type MutationInput = (
  | { readonly insert: AliasFor<Entity>; readonly values: object | readonly object[]; readonly from?: never }
  | { readonly insert: AliasFor<Entity>; readonly from: SetOperand; readonly values?: never }
  | { readonly update: AliasFor<Entity>; readonly set: object }
  | { readonly delete: AliasFor<Entity> }
) & { readonly returning?: MutationReturning } & MutationFilter;

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
  ? TargetEntity<M> extends infer T extends Entity
    ? TypeMapEntry<T, "supportsEmExecute"> extends true
      ? { readonly [K in keyof M]: K extends MutationClause<M> ? unknown : never } & {
          readonly returning?: M extends { readonly returning?: infer R }
            ? CheckReturning<R, NameOf<TargetAlias<M>>>
            : never;
        } & (
            | (M extends { readonly values: infer V } ? { readonly values: CheckValues<T, V> } : never)
            | (M extends { readonly from: infer Q extends SetOperand }
                ? { readonly from: CheckInsertSource<T, Q> }
                : never)
            | (M extends { readonly set: infer V }
                ? { readonly set: CheckAssignments<V, UpdateValues<T>, NameOf<TargetAlias<M>>> }
                : never)
            | (M extends { readonly delete: unknown } ? unknown : never)
          )
      : "SQL mutations require a supported non-inherited target and regenerated metadata"
    : never
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
      ? ["insert", "values", "from", "returning"]
      : [operation, "where", "allowAll", "softDeletes", "returning", ...(operation === "update" ? ["set"] : [])];
  checkPojo(statement, allowed, `SQL ${operation}`);
  const target = statement[operation];
  if (!isAlias(target)) fail("A mutation target must be an entity alias");
  const mgmt = getAliasMgmt(target);
  const meta = mgmt.meta;
  if (meta.inheritanceType || meta.baseType || meta.baseTypes.length || meta.subTypes.length) {
    fail("SQL mutations do not support CTI/STI targets or inherited table families");
  }
  if (meta.supportsEmExecute !== true)
    fail(`SQL mutations require supported physical metadata for ${meta.type}; run codegen`);
  const fields: StoredField[] = Object.values(meta.allFields).filter((field) => isStoredField(field));
  for (const field of fields) {
    requireColumnMetadata(meta, field);
  }
  const assigner = new AliasAssigner();
  const ctx = new Ctx(assigner, undefined);
  const alias = assigner.getAlias(meta.tableName);
  ctx.register(mgmt, alias);
  const returning = statement.returning === undefined ? undefined : projectionToSql(statement.returning, ctx);
  let sql = `${operation === "delete" ? "DELETE FROM" : operation.toUpperCase() + (operation === "insert" ? " INTO" : "")} ${kq(meta.tableName)} AS ${kq(alias)}`;
  const bindings: unknown[] = [];
  if (operation === "insert") {
    if ("values" in statement === "from" in statement) fail("INSERT requires exactly one of values or from");
    const required = fields.filter((field) => isRequired(meta, field));
    if ("values" in statement) {
      const rows = Array.isArray(statement.values) ? statement.values : [statement.values];
      // No target is registered here: value subqueries own their sources, but no existing INSERT row exists.
      const valuesCtx = new Ctx(assigner, undefined);
      const entries = rows.map((row) => assignments(meta, row, "insert"));
      for (const row of entries) {
        for (const field of required) {
          if (!row.some((entry) => entry[0] === field.fieldName))
            fail(`INSERT requires ${meta.type}.${field.fieldName}`);
        }
      }
      if (rows.length === 0) return undefined;
      const keys = fields.filter((field) => entries.some((row) => row.some((entry) => entry[0] === field.fieldName)));
      sql += ` (${keys.map((field) => kq(field.serde.columns[0].columnName)).join(", ")}) VALUES `;
      sql += entries
        .map((row) => {
          const cells = keys.map((field) => {
            const entry = row.find((entry) => entry[0] === field.fieldName);
            if (!entry) return "DEFAULT";
            const cell = assignmentToSql(meta, field, entry[1], valuesCtx);
            bindings.push(...cell.bindings);
            return cell.sql;
          });
          return `(${cells.join(", ")})`;
        })
        .join(", ");
    } else {
      const source = parseUserQuery(statement.from);
      if (source.output.kind !== "pojo") fail("INSERT SELECT requires named POJO output columns");
      const columns = source.output.columns;
      for (const field of required) {
        if (!columns.some((column) => column[0] === field.fieldName))
          fail(`INSERT requires ${meta.type}.${field.fieldName}`);
      }
      for (const [key, expr] of columns) {
        const field = writableField(meta, key, "insert");
        const targetExpr = asNode((target as unknown as Record<string, ExprLike<unknown>>)[key]);
        const left = targetExpr.outputType;
        const right = expr.outputType;
        if (
          !left ||
          !right ||
          left.dbType !== right.dbType ||
          left.domain !== right.domain ||
          left.idMeta !== right.idMeta
        ) {
          fail(`INSERT SELECT ${meta.type}.${key} has incompatible or unknown storage codecs`);
        }
        if (!field.serde.columns[0].sqlNullable && expr.sqlNullable === true)
          fail(`INSERT SELECT ${meta.type}.${key} cannot accept a nullable output`);
      }
      const keys = fields.filter((field) => columns.some((column) => column[0] === field.fieldName));
      const sourceAlias = safeKq(assigner.getLiteralAlias("sq"));
      sql += ` (${keys.map((field) => kq(field.serde.columns[0].columnName)).join(", ")}) SELECT ${keys.map((field) => `${sourceAlias}.${safeKq(field.fieldName)}`).join(", ")} FROM (${source.sql}) AS ${sourceAlias}`;
      bindings.push(...source.bindings);
    }
  } else {
    if (statement.allowAll !== undefined && typeof statement.allowAll !== "boolean") fail("allowAll must be a boolean");
    if (
      statement.softDeletes !== undefined &&
      statement.softDeletes !== "include" &&
      statement.softDeletes !== "exclude"
    )
      fail("softDeletes must be 'include' or 'exclude'");
    const user = mutationCondition(statement.where, ctx);
    if (!user && statement.allowAll !== true) fail("UPDATE and DELETE require a nonempty user where or allowAll: true");
    if (operation === "update") {
      const entries = assignments(meta, statement.set, "update");
      sql +=
        " SET " +
        entries
          .map((entry) => {
            const [key, value] = entry;
            const field = writableField(meta, key, "update");
            const cell = assignmentToSql(meta, field, value, ctx);
            bindings.push(...cell.bindings);
            return `${kq(field.serde.columns[0].columnName)} = ${cell.sql}`;
          })
          .join(", ");
    }
    const injected = conditionToSql(
      { and: injectedConditions({ meta, alias }, statement.softDeletes ?? "exclude") },
      ctx,
      true,
    );
    const conditions = [user, injected].filter((condition) => condition !== undefined);
    if (conditions.length) {
      sql += ` WHERE ${conditions.map((condition) => `(${condition.sql})`).join(" AND ")}`;
      for (const condition of conditions) bindings.push(...condition.bindings);
    }
  }
  if (returning) {
    sql += ` RETURNING ${returning.selects.map((select) => select.sql).join(", ")}`;
    for (const select of returning.selects) bindings.push(...select.bindings);
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

type MutationTarget<T extends Entity> = AliasFor<T> &
  (TypeMapEntry<T, "supportsEmExecute"> extends true ? unknown : never);
type MutationFilter = {
  readonly where?: ExpressionCondition | ExprLike<boolean>;
  readonly allowAll?: boolean;
  readonly softDeletes?: "include" | "exclude";
};
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
    | "with"
    | "ctes"
    | "using"
    | "onConflict",
    never
  >
>;
type InsertKey<T> = {
  [K in keyof FieldsOf<T>]: FieldsOf<T>[K] extends { columns: [{ insert: "required" | "optional" }] } ? K : never;
}[keyof FieldsOf<T>];
type RequiredInsertKey<T> = {
  [K in keyof FieldsOf<T>]: FieldsOf<T>[K] extends { columns: [{ insert: "required" }] } ? K : never;
}[keyof FieldsOf<T>];
type UpdateKey<T> = {
  [K in keyof FieldsOf<T>]: FieldsOf<T>[K] extends { columns: [{ update: true }] } ? K : never;
}[keyof FieldsOf<T>];
type DomainValue<T, K extends keyof FieldsOf<T>> = K extends "id"
  ? IdOf<T>
  : FieldsOf<T>[K] extends { kind: "m2o"; type: infer U }
    ? IdOf<U>
    : FieldsOf<T>[K] extends { type: infer V }
      ? V
      : never;
type SqlValue<T, K extends keyof FieldsOf<T>> =
  | DomainValue<T, K>
  | (FieldsOf<T>[K] extends { columns: [{ nullable: true }] } ? null : never);
type Assignment<T, K extends keyof FieldsOf<T>> =
  | SqlValue<T, K>
  | ExprLike<SqlValue<T, K>>
  | (FieldsOf<T>[K] extends { kind: "m2o"; type: infer U } ? U : never);
type InsertSourceRow<T> = { [K in RequiredInsertKey<T>]: SqlValue<T, K> } & {
  [K in Exclude<InsertKey<T>, RequiredInsertKey<T>>]?: SqlValue<T, K>;
};
type InsertProjection<T> = { [K in RequiredInsertKey<T>]: ExprLike<SqlValue<T, K>> } & {
  [K in Exclude<InsertKey<T>, RequiredInsertKey<T>>]?: ExprLike<SqlValue<T, K>>;
};
type UnionKeys<V> = V extends unknown ? keyof V : never;
/** Collects every alternative before scope checking; a valid branch cannot hide an unrelated alias. */
type UnionValue<V, K extends PropertyKey> = V extends unknown ? (K extends keyof V ? V[K] : never) : never;
type ExprSource<V> = V extends { readonly [exprBrand]: ExprBrand<unknown, infer Src> } ? Src : never;
type CheckExprScope<V, Scope> =
  string extends ExprSource<V>
    ? unknown
    : [Exclude<ExprSource<V>, Scope>] extends [never]
      ? unknown
      : "Expression source is not in the statement scope";
type ReturningExpr<R> = R extends ExprLike<unknown> ? R : R extends undefined ? never : R[keyof R];
type EmptyReturning<R> = R extends object ? (keyof R extends never ? true : false) : false;
type CheckReturning<R, Scope> = true extends EmptyReturning<R> ? never : CheckExprScope<ReturningExpr<R>, Scope>;
type CheckAssignments<V, Allowed, Scope> = [Exclude<UnionKeys<V>, keyof Allowed>] extends [never]
  ? Allowed & {
      [K in UnionKeys<V>]?: CheckExprScope<UnionValue<V, K>, Scope>;
    }
  : "SQL assignments have unknown target fields";
type CheckValues<T extends Entity, V> =
  | ([Extract<V, readonly unknown[]>] extends [never]
      ? never
      : readonly CheckAssignments<Extract<V, readonly unknown[]>[number], InsertValues<T>, never>[])
  | ([Exclude<V, readonly unknown[]>] extends [never]
      ? never
      : CheckAssignments<Exclude<V, readonly unknown[]>, InsertValues<T>, never>);
type CheckSourceScope<Q> = Q extends { readonly select: infer S; readonly from: infer F }
  ? CheckScope<S, F, "join" extends keyof Q ? Extract<Q[keyof Q & "join"], QueryJoins> : []>
  : {
      [K in keyof Q]: K extends SetOperation
        ? Q[K] extends readonly unknown[]
          ? { [I in keyof Q[K]]: CheckSourceScope<Q[K][I]> }
          : unknown
        : unknown;
    };
type CheckInsertSource<T, Q extends SetOperand> = SetOperand extends Q
  ? "INSERT source was typed too generically; retain its named output fields"
  : ReadQueryRow<Q> extends InsertSourceRow<T>
    ? Exclude<UnionKeys<ReadQueryRow<Q>>, InsertKey<T>> extends never
      ? CheckReadQuery<Q> &
          CheckSourceScope<Q> &
          (Q extends SetQuery<readonly SetOperand[]> ? CheckSetQuery<Q> : unknown)
      : "INSERT SELECT has unknown target fields"
    : "INSERT SELECT requires compatible values for all SQL-required fields";
type TargetEntity<M> = M extends
  | { readonly insert: AliasFor<infer T> }
  | { readonly update: AliasFor<infer T> }
  | { readonly delete: AliasFor<infer T> }
  ? T
  : never;
type TargetAlias<M> = M extends
  | { readonly insert: infer A }
  | { readonly update: infer A }
  | { readonly delete: infer A }
  ? A
  : never;
type MutationClause<M> =
  | "returning"
  | (M extends { readonly insert: unknown }
      ? "insert" | (M extends { readonly values: unknown } ? "values" : "from")
      : "where" | "allowAll" | "softDeletes" | (M extends { readonly update: unknown } ? "update" | "set" : "delete"));
type StoredField = Extract<Field, { kind: "primaryKey" | "primitive" | "enum" | "m2o" }>;

/** Only ordinary single-column persisted fields can be assigned without ORM relationship processing. */
function isStoredField(field: Field): field is StoredField {
  return ["primaryKey", "primitive", "enum", "m2o"].includes(field.kind) && field.serde?.columns.length === 1;
}

/** SQL defaults, generated expressions, and Joist's numeric ID/timestamp conventions permit omission. */
function isRequired(meta: EntityMetadata, field: StoredField): boolean {
  if (field.kind === "primaryKey" && (meta.idDbType === "int" || meta.idDbType === "bigint")) return false;
  const column = field.serde.columns[0];
  return (
    !column.sqlNullable &&
    !column.hasDefault &&
    !column.isGenerated &&
    field.fieldName !== meta.timestampFields?.createdAt &&
    field.fieldName !== meta.timestampFields?.updatedAt
  );
}

/** Legacy columns remain readable, but mutations require complete physical facts. */
function requireColumnMetadata(meta: EntityMetadata, field: StoredField): void {
  const column = field.serde.columns[0];
  if (
    typeof column.sqlNullable !== "boolean" ||
    typeof column.hasDefault !== "boolean" ||
    typeof column.isGenerated !== "boolean"
  )
    fail(`Missing physical metadata for ${meta.type}.${field.fieldName}; run codegen`);
}

/** Validates every supplied key, including undefined fields, before pruning omitted values. */
function assignments(meta: EntityMetadata, value: unknown, operation: "insert" | "update"): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value) || isExpr(value) || isEntity(value))
    fail(`${operation} assignments must be a field POJO`);
  const entries = Object.entries(value);
  for (const [key] of entries) writableField(meta, key, operation);
  checkPojo(value, Object.keys(meta.allFields), `${operation} assignments`);
  const defined = entries.filter((entry) => entry[1] !== undefined);
  if (!defined.length) fail(`${operation} requires at least one defined field; empty rows/sets are not DEFAULT VALUES`);
  return defined;
}

/** Applies physical write restrictions, not ORM-derived, protected, or business-immutable flags. */
function writableField(meta: EntityMetadata, key: string, operation: "insert" | "update"): StoredField {
  const field = Object.hasOwn(meta.allFields, key) ? meta.allFields[key] : undefined;
  if (!field || !isStoredField(field)) fail(`Unsupported SQL mutation field ${meta.type}.${key}`);
  requireColumnMetadata(meta, field);
  if (operation === "update" && field.kind === "primaryKey") fail("UPDATE primary-key assignments are not supported");
  if (field.serde.columns[0].isGenerated) fail(`Generated field ${meta.type}.${key} is omit-only`);
  return field;
}

/**
 * Classifies SQL expressions and SQL NULL before invoking the column's entity-independent write codec.
 * Normalizes public PK/FK ids to internal tagged ids using the target entity's idType.
 */
function assignmentToSql(meta: EntityMetadata, field: StoredField, value: unknown, ctx: Ctx): SqlFragment {
  if (isExpr(value)) return asNode(value).toSql(ctx);
  if (value === null) {
    if (!field.serde.columns[0].sqlNullable) fail(`${meta.type}.${field.fieldName} is physically NOT NULL`);
    return { sql: "NULL", bindings: [], refs: [] };
  }
  if (field.kind === "m2o" || field.kind === "primaryKey") {
    const other = field.kind === "m2o" ? field.otherMetadata() : meta;
    if (isEntity(value)) {
      if (field.kind !== "m2o" || !(value instanceof other.cstr)) fail(`Expected a ${other.type} reference`);
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
  const column = field.serde.columns[0];
  if (!column.mapToDbValue) fail(`The codec for ${meta.type}.${field.fieldName} does not support SQL value writes`);
  return { sql: "?", bindings: [column.mapToDbValue(value)], refs: [] };
}

/** Checks the user predicate independently so metadata filters cannot turn a pruned guard into consent. */
function mutationCondition(value: unknown, ctx: Ctx): SqlFragment | undefined {
  if (isExpr(value)) return asNode(value).toSql(ctx);
  return conditionToSql(value as ExpressionCondition | undefined, ctx, true);
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
