import * as ts from "typescript";
import { SourceFile } from "typescript";

export const transformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
  const { factory: f } = ctx;

  const visit: ts.Visitor = (node) => {
    if (ts.isPropertyDeclaration(node) && node.initializer && shouldRewrite(node.type?.getText())) {
      // Check if the property has an initializer
      const privateIdentifier = f.createPrivateIdentifier("#" + node.name.getText());
      const getterName = node.name;

      // Create private field with unique name and no initializer
      const privateField = f.createPropertyDeclaration(undefined, privateIdentifier, undefined, undefined, undefined);

      // Create a getter for the private field that initializes it if necessary
      const getter = f.createGetAccessorDeclaration(
        undefined,
        getterName,
        [],
        node.type,
        f.createBlock([
          f.createIfStatement(
            f.createBinaryExpression(
              f.createPropertyAccessExpression(f.createThis(), privateIdentifier),
              f.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
              f.createIdentifier("undefined"),
            ),
            f.createBlock(
              [
                f.createExpressionStatement(
                  f.createBinaryExpression(
                    f.createPropertyAccessExpression(f.createThis(), privateIdentifier),
                    f.createToken(ts.SyntaxKind.EqualsToken),
                    node.initializer,
                  ),
                ),
              ],
              true,
            ),
          ),
          f.createReturnStatement(f.createPropertyAccessExpression(f.createThis(), privateIdentifier)),
        ]),
      );
      return [privateField, getter];
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
