import { AuthorCodegen } from "./entities.js";

import { authorConfig as config } from "./entities.js";

export class Author extends AuthorCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
