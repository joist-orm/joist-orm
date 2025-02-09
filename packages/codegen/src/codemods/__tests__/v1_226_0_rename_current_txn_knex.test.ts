import { defineTest } from "jscodeshift/src/testUtils";

describe("v1_226_0_rename_current_txn_knex", () => {
  defineTest(__dirname, "v1_226_0_rename_current_txn_knex", null, "v1_226_0_rename_current_txn_knex", {
    parser: "ts",
  });
});
