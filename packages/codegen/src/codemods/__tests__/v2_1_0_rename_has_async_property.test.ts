import { defineTest } from "jscodeshift/src/testUtils";

describe("v2_1_0_rename_has_async_property", () => {
  defineTest(__dirname, "v2_1_0_rename_has_async_property", null, "v2_1_0_rename_has_async_property", {
    parser: "ts",
  });
});
