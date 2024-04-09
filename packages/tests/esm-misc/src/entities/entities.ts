// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./codegen/ArtistCodegen.js";
export * from "./codegen/AuthorCodegen.js";
export * from "./codegen/BookCodegen.js";
export * from "./codegen/DatabaseOwnerCodegen.js";
export * from "./codegen/PaintingCodegen.js";
export * from "./Artist.js";
export * from "./Author.js";
export * from "./Book.js";
export * from "./DatabaseOwner.js";
export * from "./Painting.js";

export * from "./factories/newArtist.js";
export * from "./factories/newAuthor.js";
export * from "./factories/newBook.js";
export * from "./factories/newDatabaseOwner.js";
export * from "./factories/newPainting.js";
export * from "./codegen/metadata.js";
