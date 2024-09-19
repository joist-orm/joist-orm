import { TaskCodegen } from "./entities";

import { taskConfig as config } from "./entities";

// Abstract so that sub types can provide different implementations for derived fields
export abstract class Task extends TaskCodegen {}

// For testing that setDefaults works on subtypes
config.setDefault("durationInDays", () => 10);
