import { SmallPublisherCodegen } from "./entities";

import { smallPublisherConfig as config } from "./entities";

export class SmallPublisher extends SmallPublisherCodegen {
  public beforeFlushRan = false;
  public beforeCreateRan = false;
  public beforeUpdateRan = false;
  public beforeDeleteRan = false;
  public afterValidationRan = false;
  public afterCommitRan = false;
}

config.addRule((p) => {
  if (p.name === "large") {
    return "name cannot be large";
  }
});

// Noop rule to verify we can check both subtype & based type fields
config.beforeFlush((sp) => {
  if (sp.changes.city.hasChanged || sp.changes.name.hasChanged) {
  }
});

config.beforeFlush(async (sp) => {
  sp.beforeFlushRan = true;
});

config.beforeCreate((sp) => {
  sp.beforeCreateRan = true;
});

config.beforeUpdate((sp) => {
  sp.beforeUpdateRan = true;
});

config.afterValidation((sp) => {
  sp.afterValidationRan = true;
});

config.beforeDelete((sp) => {
  sp.beforeDeleteRan = true;
});

config.afterCommit((sp) => {
  sp.afterCommitRan = true;
});
