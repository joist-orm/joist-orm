import { AsyncProperty, hasReactiveAsyncProperty } from "joist-orm";
import { TaskOldCodegen, taskOldConfig as config } from "./entities";

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
}

/** For testing that STI reactive rules run correctly. */
config.addRule("deletedAt", (t) => {
  t.transientFields.oldReactiveRuleRan = true;
});

/** For testing that STI subtype hooks run correctly. */
config.addRule((t) => {
  t.transientFields.oldSimpleRuleRan = true;
});
