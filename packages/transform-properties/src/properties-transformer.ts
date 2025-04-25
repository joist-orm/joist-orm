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
        isCommonJs ??= detectModuleFormat(sourceFile) === "cjs";

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

// We used to look at `ctx.getCompilerOptions().module`, which will be NodeNext, Node20, CommonJS, etc.,
// but that still requires looking at `package.json`'s `type=module`, so its easier to just look directly
// at the transformed-so-far source.
function detectModuleFormat(sourceFile: ts.SourceFile): "esm" | "cjs" {
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) return "esm";
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.Identifier &&
      (node.expression as ts.Identifier).text === "require" &&
      isTopLevelRequire(node)
    )
      return "cjs";
  });
  return "cjs";
}

// Check if this node is at the module scope
function isTopLevelRequire(node: ts.Node): boolean {
  let current = node;
  while (current.parent) {
    // If we hit a function declaration or expression before reaching the source file,
    // then this is not a top-level require
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      return false;
    }
    current = current.parent;
  }
  return true;
}
