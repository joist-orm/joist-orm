import ts from "typescript";
import { transformer } from "./properties-transformer";

describe("properties-transformer", () => {
  it("should rewrite async properties in CJS", () => {
    const source = `
      import { hasAsyncProperty } from "joist-orm";
      class Author {
        readonly numberOfBooks: AsyncProperty<number> = hasAsyncProperty<number>(() => {
          return 1;
        });
      }
    `;
    const result = compile(source, {
      module: ts.ModuleKind.CommonJS,
    });
    expect(result).toMatchInlineSnapshot(`
     ""use strict";
     Object.defineProperty(exports, "__esModule", { value: true });
     const joist_orm_1 = require("joist-orm");
     class Author {
         get numberOfBooks() { return this.__data.relations.numberOfBooks ??= (setCurrentlyInstantiatingEntity(this), (0, joist_orm_1.hasAsyncProperty)(() => {
             return 1;
         })); }
     }
     const { setCurrentlyInstantiatingEntity } = joist_orm_1;
     "
    `);
  });

  it("should rewrite async properties in ESM", () => {
    const source = `
      import { hasAsyncProperty } from "joist-orm";
      class Author {
        readonly numberOfBooks: AsyncProperty<number> = hasAsyncProperty<number>(() => {
          return 1;
        });
      }
    `;
    const result = compile(source, {
      module: ts.ModuleKind.ESNext,
    });
    expect(result).toMatchInlineSnapshot(`
     "import { hasAsyncProperty } from "joist-orm";
     class Author {
         get numberOfBooks() { return this.__data.relations.numberOfBooks ??= (setCurrentlyInstantiatingEntity(this), hasAsyncProperty(() => {
             return 1;
         })); }
     }
     import { setCurrentlyInstantiatingEntity } from "joist-orm";
     "
    `);
  });
});

function compile(source: string, opts: ts.CompilerOptions): string {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      ...opts,
    },
    transformers: { before: [transformer] },
  });
  return result.outputText;
}
