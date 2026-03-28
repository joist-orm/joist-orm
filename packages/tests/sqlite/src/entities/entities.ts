// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./codegen/AuthorCodegen";
export * from "./codegen/BookCodegen";
export * from "./Author";
export * from "./Book";

export * from "./factories/newAuthor";
export * from "./factories/newBook";
export * from "./codegen/metadata";
