// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./codegen/AuthorCodegen.ts";
export * from "./codegen/BookCodegen.ts";
export * from "./Author.ts";
export * from "./Book.ts";

export * from "./factories/newAuthor.ts";
export * from "./factories/newBook.ts";
export * from "./codegen/metadata.ts";
