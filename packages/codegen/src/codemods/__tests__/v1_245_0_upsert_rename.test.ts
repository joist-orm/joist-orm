import { defineTest } from "jscodeshift/src/testUtils";

describe("v1_245_0_upsert_rename", () => {
  defineTest(__dirname, "v1_245_0_upsert_rename", null, "v1_245_0_upsert_rename", {
    parser: "ts",
  });
});
