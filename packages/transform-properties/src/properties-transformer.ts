import * as ts from "typescript";
import { ModuleKind, SourceFile } from "typescript";

export const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
  const { factory: f } = ctx;

  const isCommonJs = ctx.getCompilerOptions().module === ModuleKind.CommonJS;

  return (sourceFile) => {
    // Create the import declaration for `setCurrentlyInstantiatingEntity` so
    // that our lazy initialized property is hooked up to the right entity.
    // const [importFn, importDecl] = createImportDeclaration(f, "joist-orm", "setCurrentlyInstantiatingEntity");
    // sourceFile = f.updateSourceFile(sourceFile, [importDecl, ...sourceFile.statements]);

    let didRewrite = false;
    const visit: ts.Visitor = (node) => {
      if (ts.isPropertyDeclaration(node) && node.initializer && shouldRewrite(node.type?.getText())) {
        didRewrite = true;
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
      typeName.startsWith("Collection<") ||
      typeName.startsWith("Reference<"))
  );
}
