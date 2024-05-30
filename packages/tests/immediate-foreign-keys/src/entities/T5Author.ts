import { T5AuthorCodegen } from "./entities";

import { t5AuthorConfig as config } from "./entities";

export class T5Author extends T5AuthorCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
