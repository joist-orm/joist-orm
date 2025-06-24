import { TagCodegen } from "./entities";

import { tagConfig as config } from "./entities";

export class Tag extends TagCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
