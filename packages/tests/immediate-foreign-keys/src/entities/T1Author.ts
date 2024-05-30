import { T1AuthorCodegen } from "./entities";

import { t1AuthorConfig as config } from "./entities";

export class T1Author extends T1AuthorCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
