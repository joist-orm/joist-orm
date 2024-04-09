import { BookCodegen } from "./entities";

import { bookConfig as config } from "./entities.js";

export class Book extends BookCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
