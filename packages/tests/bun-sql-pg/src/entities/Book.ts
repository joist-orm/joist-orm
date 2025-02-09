import { BookCodegen, bookConfig as config } from "src/entities/entities.ts";

export class Book extends BookCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
