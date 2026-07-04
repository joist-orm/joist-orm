import { AuthorCodegen } from "./entities";

import { authorConfig as config } from "./entities";

export class Author extends AuthorCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
