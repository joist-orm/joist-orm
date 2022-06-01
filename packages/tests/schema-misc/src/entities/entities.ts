// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./ArtistCodegen";
export * from "./AuthorCodegen";
export * from "./BookCodegen";
export * from "./PaintingCodegen";
export * from "./Artist";
export * from "./Author";
export * from "./Book";
export * from "./Painting";

export * from "./factories";
export * from "./metadata";
