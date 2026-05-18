import { ParentGroupCodegen } from "./entities";

import { parentGroupConfig as config } from "./entities";

export class ParentGroup extends ParentGroupCodegen {
  public transientFields = {
    reactions: {
      parentItemsUpdatedAt: 0,
    },
  };
}

// Testing reacting to updatedAt changes
config.addReaction({ parentItems: "updatedAt" }, (pg) => {
  pg.transientFields.reactions.parentItemsUpdatedAt += 1;
});
