import { readFile } from "fs/promises";
import { join } from "path";
import ts from "typescript";
import { type Config } from "./config";

export interface ScopeMember {
  // i.e. "adult" from `static adult: AuthorScope = scope(...)`.
  name: string;
  // i.e. "AuthorScope" or "(prefix: string) => AuthorScope".
  type: string;
}

export type ScopeMembersByEntity = Record<string, ScopeMember[]>;

/** Finds static scope declarations for all user-owned entity files. */
export async function findAllEntityScopes(config: Config, entityNames: string[]): Promise<ScopeMembersByEntity> {
  const entries = await Promise.all(
    entityNames.map(function findScopes(entityName) {
      return findEntityScopes(config, entityName, `${entityName}Scope`);
    }),
  );
  return Object.fromEntries(entries);
}

/** Finds static scope declarations in the user-owned entity file. */
async function findEntityScopes(
  config: Config,
  entityName: string,
  scopeTypeName: string,
): Promise<[string, ScopeMember[]]> {
  // i.e. `packages/tests/integration/src/entities/Author.ts` when `entityName` is "Author".
  const fileName = join(config.entitiesDirectory, `${entityName}.ts`);
  const contents = await readEntityFile(fileName);
  if (contents === undefined) return [entityName, []];

  const sourceFile = ts.createSourceFile(
    fileName,
    contents,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    // i.e. `export class Author extends AuthorCodegen { ... }`.
    if (ts.isClassDeclaration(statement) && statement.name?.text === entityName) {
      const scopeMembers = statement.members.flatMap(function maybeScopeMember(member) {
        return toScopeMember(sourceFile, member, scopeTypeName);
      });
      return [entityName, scopeMembers];
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
function toScopeMember(sourceFile: ts.SourceFile, member: ts.ClassElement, scopeTypeName: string): ScopeMember[] {
  if (!ts.isPropertyDeclaration(member)) return [];
  if (!isStaticMember(member)) return [];
  // i.e. accept `static adult: AuthorScope = scope(...)`, but skip methods/getters/untyped fields.
  if (!member.type || !member.initializer || !ts.isIdentifier(member.name)) return [];
  if (!isScopeType(member.type, scopeTypeName) || !isScopeInitializer(member.initializer)) return [];
  return [{ name: member.name.text, type: member.type.getText(sourceFile) }];
}

/** Returns true if the member has a static modifier. */
function isStaticMember(member: ts.ClassElement): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  return modifiers?.some(function isStatic(modifier: ts.ModifierLike) {
    return modifier.kind === ts.SyntaxKind.StaticKeyword;
  }) ?? false;
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

/** Returns true for `scope(...)` and `scope.fn(...)` calls. */
function isScopeInitializer(initializer: ts.Expression): boolean {
  if (!ts.isCallExpression(initializer)) return false;
  const expression = initializer.expression;
  // i.e. `scope({ age: { gte: 18 } })`.
  if (ts.isIdentifier(expression)) return expression.text === "scope";
  // i.e. `scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`))`.
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "fn" &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "scope"
  );
}
