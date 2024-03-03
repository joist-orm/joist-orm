import { TaskOldCodegen } from "./entities";
import { taskOldConfig as config } from "./entities";

export class TaskOld extends TaskOldCodegen {
  transientFields = {
    oldHookRan: false,
  };
}

/** For testing that STI subtype hooks run correctly. */
config.addRule((t) => {
  t.transientFields.oldHookRan = true;
});
