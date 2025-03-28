// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./codegen/AuthorCodegen";
export * from "./codegen/BookCodegen";
export * from "./codegen/BookReviewCodegen";
export * from "./codegen/CommentCodegen";
export * from "./Author";
export * from "./Book";
export * from "./BookReview";
export * from "./Comment";

export * from "./factories/newAuthor";
export * from "./factories/newBook";
export * from "./factories/newBookReview";
export * from "./factories/newComment";
export * from "./codegen/metadata";
