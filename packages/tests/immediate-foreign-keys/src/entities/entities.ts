// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./codegen/T1AuthorCodegen";
export * from "./codegen/T1BookCodegen";
export * from "./codegen/T2AuthorCodegen";
export * from "./codegen/T2BookCodegen";
export * from "./codegen/T3AuthorCodegen";
export * from "./codegen/T3BookCodegen";
export * from "./codegen/T4AuthorCodegen";
export * from "./codegen/T4BookCodegen";
export * from "./codegen/T5AuthorCodegen";
export * from "./codegen/T5BookCodegen";
export * from "./codegen/T5BookReviewCodegen";
export * from "./T1Author";
export * from "./T1Book";
export * from "./T2Author";
export * from "./T2Book";
export * from "./T3Author";
export * from "./T3Book";
export * from "./T4Author";
export * from "./T4Book";
export * from "./T5Author";
export * from "./T5Book";
export * from "./T5BookReview";

export * from "./factories/newT1Author";
export * from "./factories/newT1Book";
export * from "./factories/newT2Author";
export * from "./factories/newT2Book";
export * from "./factories/newT3Author";
export * from "./factories/newT3Book";
export * from "./factories/newT4Author";
export * from "./factories/newT4Book";
export * from "./factories/newT5Author";
export * from "./factories/newT5Book";
export * from "./factories/newT5BookReview";
export * from "./codegen/metadata";
