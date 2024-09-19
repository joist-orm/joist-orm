import { AsyncProperty, hasReactiveAsyncProperty, hasReactiveField, ReactiveField } from "joist-orm";
import { taskOldConfig as config, TaskOldCodegen } from "./entities";

export class TaskOld extends TaskOldCodegen {
  transientFields = {
    oldSimpleRuleRan: false,
    oldReactiveRuleRan: false,
  };

  /** For testing reacting to poly CommentParent properties. */
  readonly commentParentInfo: AsyncProperty<TaskOld, string> = hasReactiveAsyncProperty(
    { parentOldTask: "id" },
    (t) => `parent=${t.parentOldTask.get?.id}`,
  );

  get syncDerived(): string | undefined {
    return "SyncDerivedOld";
  }

  readonly asyncDerived: ReactiveField<TaskOld, string | undefined> = hasReactiveField(
    "asyncDerived",
    { syncDerived: [], oldTaskTaskItems: "oldTask" },
    (tn) => `${tn.syncDerived} AsyncDerived`,
  );
}

config.setDefault("syncDefault", () => "TaskOld");

config.setDefault("asyncDefault_1", ["syncDefault", "oldTaskTaskItems"], (tn) => `${tn.syncDefault} Async1`);

config.setDefault("asyncDefault_2", ["asyncDefault_1", "oldTaskTaskItems"], (tn) => `${tn.asyncDefault_1} Async2`);

/** For testing that STI reactive rules run correctly. */
config.addRule("deletedAt", (t) => {
  t.transientFields.oldReactiveRuleRan = true;
});

/** For testing that STI subtype hooks run correctly. */
config.addRule((t) => {
  t.transientFields.oldSimpleRuleRan = true;
});
