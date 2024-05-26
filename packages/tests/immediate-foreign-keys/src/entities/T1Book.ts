import { T1BookCodegen } from "./entities";

import { t1BookConfig as config } from "./entities";

export class T1Book extends T1BookCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
