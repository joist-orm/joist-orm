import { BookCodegen, bookConfig } from "./entities";

export class Book extends BookCodegen {}

bookConfig.cascadeDelete("reviews");
