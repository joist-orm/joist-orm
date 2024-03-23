import { TaskCodegen } from "./entities";

import { taskConfig as config } from "./entities";

export class Task extends TaskCodegen {}

// For testing that setDefaults works on subtypes
config.setDefault("durationInDays", () => 10);
