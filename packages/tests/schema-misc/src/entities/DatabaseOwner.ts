import { DatabaseOwnerCodegen, databaseOwnerConfig as config } from "./entities";

export class DatabaseOwner extends DatabaseOwnerCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
