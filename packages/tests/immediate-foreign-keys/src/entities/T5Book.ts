import { T5BookCodegen } from "./entities";

import { t5BookConfig as config } from "./entities";

export class T5Book extends T5BookCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
