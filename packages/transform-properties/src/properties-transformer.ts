import * as ts from "typescript";
import { SourceFile } from "typescript";

export const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
  const { factory: f } = ctx;

  const visit: ts.Visitor = (node) => {
    if (ts.isPropertyDeclaration(node) && node.initializer && shouldRewrite(node.type?.getText())) {
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
              node.initializer,
            ),
          ),
        ]),
      );
      return [getter];
    }
    return ts.visitEachChild(node, visit, ctx);
  };

  return (sourceFile) => {
    return ts.visitNode(sourceFile, visit) as SourceFile;
  };
};

function shouldRewrite(typeName: string | undefined): boolean {
  return (
    !!typeName &&
    (typeName.startsWith("Reactive") ||
      typeName.startsWith("AsyncProperty<") ||
      typeName.startsWith("Collection<") ||
      typeName.startsWith("Reference<"))
  );
}
