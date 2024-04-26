import ts from "typescript";
import { transformer } from "./properties-transformer";

describe("properties-transformer", () => {
  it("should rewrite async properties", () => {
    const source = `
      class Author {
        readonly numberOfBooks: AsyncProperty<number> = hasAsyncProperty<number>();
      }
    `;
    const result = compile(source);
    expect(result).toMatchInlineSnapshot(`
     "class Author {
         #numberOfBooks;
         get numberOfBooks() { if (this.#numberOfBooks === undefined) {
             this.#numberOfBooks = hasAsyncProperty();
         } return this.#numberOfBooks; }
     }
     "
    `);
  });
});

function compile(source: string): string {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
    },
    transformers: { before: [transformer] },
  });
  return result.outputText;
}
