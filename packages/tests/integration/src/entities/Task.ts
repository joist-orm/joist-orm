import { TaskCodegen } from "./entities";

import { taskConfig as config } from "./entities";

export class Task extends TaskCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
