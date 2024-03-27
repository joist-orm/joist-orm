import { TaskNewCodegen, taskNewConfig as config } from "./entities";

export class TaskNew extends TaskNewCodegen {
  transientFields = {
    newSimpleRuleRan: false,
    newReactiveRuleRan: false,
  };
}

/** For testing that STI subtype rules run correctly. */
config.addRule((t) => {
  if (!(t instanceof TaskNew)) throw new Error("Invalid type");
  t.transientFields.newSimpleRuleRan = true;
});

/** For testing that STI subtype reactive rules run correctly. */
config.addRule("specialNewAuthor", (t) => {
  if (!(t instanceof TaskNew)) throw new Error("Invalid type");
  t.transientFields.newReactiveRuleRan = true;
});
