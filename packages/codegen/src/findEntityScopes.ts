import { readFile } from "fs/promises";
import { join } from "path";

import { type namedTypes } from "ast-types";
import { camelCase } from "change-case";
import jscodeshift from "jscodeshift";

import { type Config } from "./config.ts";
import { type Entity } from "./EntityDbMetadata.ts";

const j = jscodeshift.withParser("ts");

type Expression = NonNullable<namedTypes.ClassProperty["value"]>;
type Parameter = namedTypes.ArrowFunctionExpression["params"][number];
type TypeNode = namedTypes.TSTypeAnnotation["typeAnnotation"];

/** Each `static active = ...` scope in an entity. */
export interface ScopeMember {
  // I.e. "adult" from `static adult: AuthorScope = scope(...)`.
  name: string;
  // I.e. "AuthorScope" or "(prefix: string) => AuthorScope".
  type: string;
}

export type ScopeMembersByEntity = Record<string, ScopeMember[]>;

/** Finds static scope declarations for all entity files. */
export async function findAllEntityScopes(config: Config, entities: Entity[]): Promise<ScopeMembersByEntity> {
  return Object.fromEntries(await Promise.all(entities.map((entity) => findEntityScopes(config, entity))));
}

/** Finds static scope declarations a given entity file. */
async function findEntityScopes(config: Config, entity: Entity): Promise<[string, ScopeMember[]]> {
  const { name: entityName, scopeName: scopeTypeName } = entity;
  // i.e. `authorScope`, the conventional renamed-to-`scope` import users put in their entity files.
  const scopeFnName = `${camelCase(entityName)}Scope`;

  // i.e. `packages/tests/integration/src/entities/Author.ts` when `entityName` is "Author".
  const fileName = join(config.entitiesDirectory, `${entityName}.ts`);
  const contents = await readEntityFile(fileName);
  if (contents === undefined) return [entityName, []];
  if (contents.indexOf(scopeFnName) === -1) return [entityName, []];

  const program = j(contents).find(j.Program).nodes()[0];
  for (const statement of program.body) {
    const declaration =
      j.ExportNamedDeclaration.check(statement) || j.ExportDefaultDeclaration.check(statement)
        ? statement.declaration
        : statement;
    // i.e. `export class Author extends AuthorCodegen { ... }`.
    if (declaration && j.ClassDeclaration.check(declaration) && declaration.id?.name === entityName) {
      return [
        entityName,
        declaration.body.body.flatMap((member) => maybeScopeMember(member, entityName, scopeTypeName)),
      ];
    }
  }
  return [entityName, []];
}

/** Reads an entity file if it already exists. */
async function readEntityFile(fileName: string): Promise<string | undefined> {
  try {
    return await readFile(fileName, "utf8");
  } catch (e) {
    if (isNoSuchFileError(e)) return undefined;
    throw e;
  }
}

/** Returns true for a missing user-owned entity file. */
function isNoSuchFileError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "ENOENT";
}

/** Converts a static property declaration into a generated scope member. */
function maybeScopeMember(member: namedTypes.Node, entityName: string, scopeTypeName: string): ScopeMember[] {
  if (!j.ClassProperty.check(member) || !member.static) return [];
  // i.e. accept `static adult = scope(...)`, but skip methods/getters/unsupported fields.
  if (!member.value || !j.Identifier.check(member.key)) return [];
  if (!isScopeInitializer(member.value, entityName)) return [];
  if (member.typeAnnotation) {
    if (!j.TSTypeAnnotation.check(member.typeAnnotation)) return [];
    const type = member.typeAnnotation.typeAnnotation;
    if (!isScopeType(type, scopeTypeName)) return [];
    return [{ name: member.key.name, type: j(type).toSource() }];
  }
  const type = inferScopeType(member.value, scopeTypeName);
  return type ? [{ name: member.key.name, type }] : [];
}

/** Infers a generated scope member type from an untyped static scope initializer. */
function inferScopeType(initializer: Expression, scopeTypeName: string): string | undefined {
  return isParameterizedScopeInitializer(initializer)
    ? maybeParameterizedScope(initializer, scopeTypeName)
    : scopeTypeName;
}

/** Returns true for `scope.fn(...)` initializers. */
function isParameterizedScopeInitializer(initializer: Expression): boolean {
  return (
    j.CallExpression.check(initializer) &&
    j.MemberExpression.check(initializer.callee) &&
    !initializer.callee.computed &&
    j.Identifier.check(initializer.callee.property) &&
    initializer.callee.property.name === "fn"
  );
}

/** Returns a function type for `scope.fn((prefix: string) => ...)` initializers. */
function maybeParameterizedScope(initializer: Expression, scopeTypeName: string): string | undefined {
  if (!j.CallExpression.check(initializer)) return undefined;
  if (!j.MemberExpression.check(initializer.callee)) return undefined;
  if (initializer.callee.computed || !j.Identifier.check(initializer.callee.property)) return undefined;
  if (initializer.callee.property.name !== "fn") return undefined;
  const fn = initializer.arguments[0];
  if (!fn || (!j.ArrowFunctionExpression.check(fn) && !j.FunctionExpression.check(fn))) return undefined;
  const params = fn.params.map(parameterType);
  if (params.some((param) => param === undefined)) return undefined;
  return `(${params.join(", ")}) => ${scopeTypeName}`;
}

/** Returns a function-type parameter, i.e. `prefix: string`, when syntax-only inference is safe. */
function parameterType(param: Parameter): string | undefined {
  if (j.Identifier.check(param)) {
    if (!param.typeAnnotation || !j.TSTypeAnnotation.check(param.typeAnnotation)) return undefined;
    const optional = param.optional ? "?" : "";
    return `${param.name}${optional}: ${j(param.typeAnnotation.typeAnnotation).toSource()}`;
  }
  if (j.RestElement.check(param) && j.Identifier.check(param.argument)) {
    const typeAnnotation = param.typeAnnotation ?? param.argument.typeAnnotation;
    if (!typeAnnotation || !j.TSTypeAnnotation.check(typeAnnotation)) return undefined;
    return `...${param.argument.name}: ${j(typeAnnotation.typeAnnotation).toSource()}`;
  }
  return undefined;
}

/** Returns true for `EntityScope` and function types returning `EntityScope`. */
function isScopeType(type: TypeNode, scopeTypeName: string): boolean {
  // i.e. `AuthorScope`.
  if (j.TSTypeReference.check(type) && j.Identifier.check(type.typeName)) return type.typeName.name === scopeTypeName;
  // i.e. `(prefix: string) => AuthorScope`.
  if (j.TSFunctionType.check(type) && type.typeAnnotation && j.TSTypeAnnotation.check(type.typeAnnotation)) {
    return isScopeType(type.typeAnnotation.typeAnnotation, scopeTypeName);
  }
  if (j.TSParenthesizedType.check(type)) return isScopeType(type.typeAnnotation, scopeTypeName);
  return false;
}

/** Returns true for scope initializers, I.e. `scope(...)`, `scope(...).orderBy(...)`, or `Author.adult...`. */
function isScopeInitializer(initializer: Expression, entityName: string): boolean {
  if (!j.CallExpression.check(initializer) && !j.MemberExpression.check(initializer)) return false;
  return isScopeRootedExpression(initializer, entityName);
}

/** Returns true for a call/property expression chain rooted at `scope` or the current entity. */
function isScopeRootedExpression(expression: Expression, entityName: string): boolean {
  // i.e. `scope({ age: { gte: 18 } })`.
  if (j.Identifier.check(expression)) return expression.name === "scope" || expression.name === entityName;
  if (j.CallExpression.check(expression)) return isScopeRootedExpression(expression.callee, entityName);
  // i.e. `scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`))` or `Author.adult.orderBy(...)`.
  if (j.MemberExpression.check(expression) && !expression.computed) {
    return isScopeRootedExpression(expression.object, entityName);
  }
  return false;
}
