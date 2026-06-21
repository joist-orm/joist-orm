import { readFile } from "fs/promises";
import { join } from "path";
import ts from "typescript";
import { type Config } from "./config";

/** Each `static active = ...` scope in an entity. */
export interface ScopeMember {
  // I.e. "adult" from `static adult: AuthorScope = scope(...)`.
  name: string;
  // I.e. "AuthorScope" or "(prefix: string) => AuthorScope".
  type: string;
}

export type ScopeMembersByEntity = Record<string, ScopeMember[]>;

/** Finds static scope declarations for all entity files. */
export async function findAllEntityScopes(config: Config, entityNames: string[]): Promise<ScopeMembersByEntity> {
  return Object.fromEntries(await Promise.all(entityNames.map((entityName) => findEntityScopes(config, entityName))));
}

/** Finds static scope declarations a given entity file. */
async function findEntityScopes(config: Config, entityName: string): Promise<[string, ScopeMember[]]> {
  const scopeTypeName = `${entityName}Scope`;

  // i.e. `packages/tests/integration/src/entities/Author.ts` when `entityName` is "Author".
  const fileName = join(config.entitiesDirectory, `${entityName}.ts`);
  const contents = await readEntityFile(fileName);
  if (contents === undefined) return [entityName, []];

  const sourceFile = ts.createSourceFile(fileName, contents, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  for (const statement of sourceFile.statements) {
    // i.e. `export class Author extends AuthorCodegen { ... }`.
    if (ts.isClassDeclaration(statement) && statement.name?.text === entityName) {
      return [
        entityName,
        statement.members.flatMap((member) => maybeScopeMember(sourceFile, member, entityName, scopeTypeName)),
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
function maybeScopeMember(
  sourceFile: ts.SourceFile,
  member: ts.ClassElement,
  entityName: string,
  scopeTypeName: string,
): ScopeMember[] {
  if (!ts.isPropertyDeclaration(member)) return [];
  if (!isStaticMember(member)) return [];
  // i.e. accept `static adult = scope(...)`, but skip methods/getters/unsupported fields.
  if (!member.initializer || !ts.isIdentifier(member.name)) return [];
  if (!isScopeInitializer(member.initializer, entityName)) return [];
  if (member.type) {
    if (!isScopeType(member.type, scopeTypeName)) return [];
    return [{ name: member.name.text, type: member.type.getText(sourceFile) }];
  }
  const type = inferScopeType(sourceFile, member.initializer, scopeTypeName);
  return type ? [{ name: member.name.text, type }] : [];
}

/** Infers a generated scope member type from an untyped static scope initializer. */
function inferScopeType(sourceFile: ts.SourceFile, initializer: ts.Expression, scopeTypeName: string): string | undefined {
  return isParameterizedScopeInitializer(initializer)
    ? maybeParameterizedScope(sourceFile, initializer, scopeTypeName)
    : scopeTypeName;
}

/** Returns true for `scope.fn(...)` initializers. */
function isParameterizedScopeInitializer(initializer: ts.Expression): boolean {
  return (
    ts.isCallExpression(initializer) &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    initializer.expression.name.text === "fn"
  );
}

/** Returns a function type for `scope.fn((prefix: string) => ...)` initializers. */
function maybeParameterizedScope(
  sourceFile: ts.SourceFile,
  initializer: ts.Expression,
  scopeTypeName: string,
): string | undefined {
  if (!ts.isCallExpression(initializer)) return undefined;
  if (!ts.isPropertyAccessExpression(initializer.expression)) return undefined;
  if (initializer.expression.name.text !== "fn") return undefined;
  const fn = initializer.arguments[0];
  if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return undefined;
  const params = fn.parameters.map((param) => parameterType(sourceFile, param));
  if (params.some((param) => param === undefined)) return undefined;
  return `(${params.join(", ")}) => ${scopeTypeName}`;
}

/** Returns a function-type parameter, i.e. `prefix: string`, when syntax-only inference is safe. */
function parameterType(sourceFile: ts.SourceFile, param: ts.ParameterDeclaration): string | undefined {
  if (!ts.isIdentifier(param.name) || !param.type || param.initializer) return undefined;
  const rest = param.dotDotDotToken ? "..." : "";
  const optional = param.questionToken ? "?" : "";
  return `${rest}${param.name.text}${optional}: ${param.type.getText(sourceFile)}`;
}

/** Returns true if the member has a static modifier. */
function isStaticMember(member: ts.ClassElement): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  return modifiers?.some((modifier: ts.ModifierLike) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

/** Returns true for `EntityScope` and function types returning `EntityScope`. */
function isScopeType(type: ts.TypeNode, scopeTypeName: string): boolean {
  // i.e. `AuthorScope`.
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) return type.typeName.text === scopeTypeName;
  // i.e. `(prefix: string) => AuthorScope`.
  if (ts.isFunctionTypeNode(type)) return isScopeType(type.type, scopeTypeName);
  if (ts.isParenthesizedTypeNode(type)) return isScopeType(type.type, scopeTypeName);
  return false;
}

/** Returns true for scope initializers, I.e. `scope(...)`, `scope(...).orderBy(...)`, or `Author.adult...`. */
function isScopeInitializer(initializer: ts.Expression, entityName: string): boolean {
  if (!ts.isCallExpression(initializer) && !ts.isPropertyAccessExpression(initializer)) return false;
  return isScopeRootedExpression(initializer, entityName);
}

/** Returns true for a call/property expression chain rooted at `scope` or the current entity. */
function isScopeRootedExpression(expression: ts.Expression, entityName: string): boolean {
  // i.e. `scope({ age: { gte: 18 } })`.
  if (ts.isIdentifier(expression)) return expression.text === "scope" || expression.text === entityName;
  if (ts.isCallExpression(expression)) return isScopeRootedExpression(expression.expression, entityName);
  // i.e. `scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`))` or `Author.adult.orderBy(...)`.
  if (ts.isPropertyAccessExpression(expression)) return isScopeRootedExpression(expression.expression, entityName);
  return false;
}
