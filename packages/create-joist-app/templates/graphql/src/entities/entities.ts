import { configureMetadata } from "joist-orm";
import { Author } from "./Author";
import { authorConfig } from "./codegen/AuthorCodegen";
import { Book } from "./Book";
import { bookConfig } from "./codegen/BookCodegen";

export const entities = {
  Author,
  Book,
};

configureMetadata(entities);

export { Author, authorConfig, Book, bookConfig };
