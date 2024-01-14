import { defineTest } from "jscodeshift/src/testUtils";

describe("v1_143_0_rename_derived_async_property", () => {
  defineTest(__dirname, "v1_143_0_rename_derived_async_property", null, "v1_143_0_rename_derived_async_property", {
    parser: "ts",
  });
});
