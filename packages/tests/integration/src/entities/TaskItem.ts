import { TaskItemCodegen } from "./entities";

import { taskItemConfig as config } from "./entities";

export class TaskItem extends TaskItemCodegen {}

// remove once you have actual rules/hooks
config.placeholder();
