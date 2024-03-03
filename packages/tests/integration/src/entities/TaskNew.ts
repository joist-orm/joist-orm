import { TaskNewCodegen } from "./entities";
import { taskNewConfig as config } from "./entities";

export class TaskNew extends TaskNewCodegen {
  transientFields = {
    newHookRan: false,
  };
}

/** For testing that STI subtype hooks run correctly. */
config.addRule((t) => {
  t.transientFields.newHookRan = true;
});
