// organize-imports-ignore

// This file drives our import order to avoid undefined errors
// when the subclasses extend the base classes, see:
// https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de

export * from "./codegen/ArtistCodegen";
export * from "./codegen/AuthorCodegen";
export * from "./codegen/BookCodegen";
export * from "./codegen/DatabaseOwnerCodegen";
export * from "./codegen/PaintingCodegen";
export * from "./codegen/TagCodegen";
export * from "./Artist";
export * from "./Author";
export * from "./Book";
export * from "./DatabaseOwner";
export * from "./Painting";
export * from "./Tag";

export * from "./factories/newArtist";
export * from "./factories/newAuthor";
export * from "./factories/newBook";
export * from "./factories/newDatabaseOwner";
export * from "./factories/newPainting";
export * from "./factories/newTag";
export * from "./codegen/metadata";
