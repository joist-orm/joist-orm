import { BookCodegen, bookConfig as config } from "src/entities/index.js";

export class Book extends BookCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
