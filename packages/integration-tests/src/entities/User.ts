import { UserCodegen } from "./entities";

import { userConfig as config } from "./entities";

export class User extends UserCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
