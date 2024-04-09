import { DatabaseOwnerCodegen } from "./entities";

import { databaseOwnerConfig as config } from "./entities.js";

export class DatabaseOwner extends DatabaseOwnerCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
