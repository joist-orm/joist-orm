import { ReactiveField, hasReactiveField } from "joist-orm";

import { TaskThirdCodegen, taskThirdConfig as config } from "./entities";

/**
 * A third subtype, so `stiType` arrays can cover some subtypes but not all of them.
 * @generated TaskThird.md
 */
export class TaskThird extends TaskThirdCodegen {
  get syncDerived(): string | undefined {
    return "SyncDerivedThird";
  }

  readonly asyncDerived: ReactiveField<TaskThird, string | undefined> = hasReactiveField(
    { syncDerived: [] },
    (t) => `${t.syncDerived} AsyncDerived`,
  );
}

config.placeholder();
