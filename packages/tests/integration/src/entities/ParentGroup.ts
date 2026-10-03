import { ParentGroupCodegen, parentGroupConfig as config } from "./entities";

export class ParentGroup extends ParentGroupCodegen {
  public transientFields = {
    observedBulkData: [] as (Object | undefined)[],
    reactions: {
      parentItemsUpdatedAt: 0,
    },
  };
}

// Testing reacting to updatedAt changes
config.addReaction({ parentItems: "updatedAt" }, (pg) => {
  pg.transientFields.reactions.parentItemsUpdatedAt += 1;
});

// For testing the lazy field `bulkData` gets preloaded when another field in the rule is changed
config.addRule({ requiredData: {}, bulkData: {} }, (pg) => {
  pg.transientFields.observedBulkData.push(pg.bulkData.get);
});
