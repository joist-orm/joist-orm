import { hasReactiveField, ReactiveField } from "joist-orm";
import { taskNewConfig as config, TaskNewCodegen } from "./entities";

export class TaskNew extends TaskNewCodegen {
  transientFields = {
    newSimpleRuleRan: false,
    newReactiveRuleRan: false,
  };

  get syncDerived(): string | undefined {
    return "SyncDerivedNew";
  }

  readonly asyncDerived: ReactiveField<TaskNew, string | undefined> = hasReactiveField(
    "asyncDerived",
    { syncDerived: [], newTaskTaskItems: "oldTask" },
    (tn) => `${tn.syncDerived} AsyncDerived`,
  );
}

config.setDefault("syncDefault", () => "TaskNew");

config.setDefault("asyncDefault_1", ["syncDefault", "specialNewField"], (tn) => `${tn.syncDefault} Async1`);

config.setDefault("asyncDefault_2", ["asyncDefault_1", "newTaskTaskItems"], (tn) => `${tn.asyncDefault_1} Async2`);

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
