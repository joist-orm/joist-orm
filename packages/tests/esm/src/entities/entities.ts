// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
export * from "./enums/Color.js";

export * from "./codegen/AuthorCodegen.js";
export * from "./codegen/BookCodegen.js";
export * from "./Author.js";
export * from "./Book.js";

export * from "./factories/newAuthor.js";
export * from "./factories/newBook.js";
export * from "./codegen/metadata.js";
