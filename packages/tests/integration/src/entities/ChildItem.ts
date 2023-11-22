import { ChildItemCodegen } from "./entities";

import { childItemConfig as config } from "./entities";

export class ChildItem extends ChildItemCodegen {}

/** Ensure we're hooked up to the right parent group. */
config.addRule({ parentItem: "parentGroup", childGroup: "parentGroup" }, (ci) => {
  if (ci.parentItem.get.parentGroup.get !== ci.childGroup.get.parentGroup.get) {
    return "Mismatched parent groups";
  }
});
