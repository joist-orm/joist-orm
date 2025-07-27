import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { SourceFile } from "typescript";

export const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
  const { factory: f } = ctx;

  return (sourceFile) => {
    let isCommonJs: boolean | undefined;

    // Create the import declaration for `setCurrentlyInstantiatingEntity` so
    // that our lazy initialized property is hooked up to the right entity.
    // const [importFn, importDecl] = createImportDeclaration(f, "joist-orm", "setCurrentlyInstantiatingEntity");
    // sourceFile = f.updateSourceFile(sourceFile, [importDecl, ...sourceFile.statements]);

    let didRewrite = false;
    const visit: ts.Visitor = (node) => {
      if (ts.isPropertyDeclaration(node) && node.initializer && shouldRewrite(node.type?.getText())) {
        didRewrite = true;
        isCommonJs ??= detectModuleFormat(ctx, sourceFile) === "cjs";

        const getterName = node.name;
        const getter = f.createGetAccessorDeclaration(
          undefined,
          getterName,
          [],
          node.type,
          f.createBlock([
            f.createReturnStatement(
              f.createBinaryExpression(
                f.createPropertyAccessExpression(
                  f.createPropertyAccessExpression(
                    f.createPropertyAccessExpression(f.createThis(), f.createIdentifier("__data")),
                    f.createIdentifier("relations"),
                  ),
                  getterName.getText(),
                ),
                f.createToken(ts.SyntaxKind.QuestionQuestionEqualsToken),
                f.createParenthesizedExpression(
                  f.createBinaryExpression(
                    f.createCallExpression(f.createIdentifier("setCurrentlyInstantiatingEntity"), undefined, [
                      f.createThis(),
                    ]),
                    ts.SyntaxKind.CommaToken,
                    node.initializer,
                  ),
                ),
              ),
            ),
          ]),
        );
        return [getter];
      }
      return ts.visitEachChild(node, visit, ctx);
    };

    sourceFile = ts.visitNode(sourceFile, visit) as SourceFile;

    if (!didRewrite) return sourceFile;

    // Create a top-level symbol so that our guess of `joist_orm_1` is
    // immediately validated on boot, instead of only running on the lazy access.
    const setCurrentlyInstantiatingEntity = isCommonJs ? createCjsConst(f) : createEsmImport(f);

    return f.updateSourceFile(
      sourceFile,
      // Put the const at the end, so the requires for `joist_orm_1` are first
      [...sourceFile.statements, setCurrentlyInstantiatingEntity],
    );
  };
};

/** `const { setCurrentlyInstantiatingEntity } = joist_orm_1;` */
function createCjsConst(f: ts.NodeFactory) {
  return f.createVariableStatement(
    undefined,
    f.createVariableDeclarationList(
      [
        f.createVariableDeclaration(
          f.createObjectBindingPattern([
            f.createBindingElement(
              undefined,
              undefined,
              f.createIdentifier("setCurrentlyInstantiatingEntity"),
              undefined,
            ),
          ]),
          undefined,
          undefined,
          f.createIdentifier("joist_orm_1"),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

/** `import { setCurrentlyInstantiatingEntity } from "joist-orm"` */
function createEsmImport(f: ts.NodeFactory) {
  return f.createImportDeclaration(
    undefined,
    f.createImportClause(
      false,
      undefined,
      f.createNamedImports([
        f.createImportSpecifier(false, undefined, f.createIdentifier("setCurrentlyInstantiatingEntity")),
      ]),
    ),
    f.createStringLiteral("joist-orm"),
    undefined,
  );
}

function createImportDeclaration(f: ts.NodeFactory, moduleName: string, name: string) {
  const id = f.createIdentifier(name);
  const importSpecifiers = f.createImportSpecifier(false, undefined, id);
  const importClause = f.createImportClause(false, undefined, f.createNamedImports([importSpecifiers]));
  const decl = f.createImportDeclaration(undefined, importClause, f.createStringLiteral(moduleName));
  return [id, decl] as const;
}

function shouldRewrite(typeName: string | undefined): boolean {
  return (
    !!typeName &&
    (typeName.startsWith("Reactive") ||
      typeName.startsWith("AsyncProperty<") ||
      typeName.startsWith("AsyncMethod<") ||
      typeName.startsWith("Collection<") ||
      typeName.startsWith("Reference<"))
  );
}

/**
 * Checks for CJS/ESM output.
 *
 * We can't rely solely on `ctx.getCompilerOptions().module` because of TypeScript's
 * module resolution behavior, which considers:
 *
 * - 1. The **`module` setting** (`CommonJS`, `ESNext`, `NodeNext`, `Node20`, etc.)
 * - 2. The **`package.json` `type` field** (`"module"` vs `"commonjs"` or absent)
 * - 3. **File extensions** (`.mjs`, `.cjs`, `.js`, `.mts`, `.cts`, `.ts`)
 * - 4. **Conditional imports/exports** in package.json
 *
 * For example:
 * - With `module: "NodeNext"` and `"type": "module"` in package.json → ESM output
 * - With `module: "NodeNext"` and no `type` field (or `"type": "commonjs"`) → CommonJS output
 * - With `module: "CommonJS"` but `"type": "module"` → Still might need ESM in some cases
 */
function detectModuleFormat(ctx: ts.TransformationContext, sourceFile: ts.SourceFile): "esm" | "cjs" {
  const options = ctx.getCompilerOptions();
  if (options.module === ts.ModuleKind.CommonJS) {
    return "cjs";
  } else if (
    options.module === ts.ModuleKind.ESNext ||
    options.module === ts.ModuleKind.ES2015 ||
    options.module === ts.ModuleKind.ES2020 ||
    options.module === ts.ModuleKind.ES2022
  ) {
    return "esm";
  } else if (options.module === ts.ModuleKind.NodeNext || options.module === ts.ModuleKind.Node16) {
    // For NodeNext/Node16, check package.json type field
    return getPackageJsonType(sourceFile.fileName) === "module" ? "esm" : "cjs";
  } else {
    return "cjs";
  }
}

// Cache to avoid reading package.json multiple times during compilation
const packageJsonTypeCache = new Map<string, "module" | "commonjs">();

function getPackageJsonType(fileName: string): "module" | "commonjs" | undefined {
  let currentDir = path.dirname(fileName);
  // Walk up the directory tree to find package.json
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");
    // Check cache first
    if (packageJsonTypeCache.has(packageJsonPath)) {
      return packageJsonTypeCache.get(packageJsonPath);
    }
    try {
      if (fs.existsSync(packageJsonPath)) {
        const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonContent);
        const type = packageJson.type || "commonjs"; // default to commonjs if type is not specified
        packageJsonTypeCache.set(packageJsonPath, type);
        return type;
      }
    } catch (error) {
      // Continue searching if package.json exists but can't be read/parsed
    }
    currentDir = path.dirname(currentDir);
  }
  return "commonjs";
}
