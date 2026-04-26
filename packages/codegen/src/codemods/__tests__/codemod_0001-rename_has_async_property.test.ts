import { defineTest } from "jscodeshift/src/testUtils";

describe("codemod_0001-rename_has_async_property", () => {
  defineTest(__dirname, "codemod_0001-rename_has_async_property", null, "codemod_0001-rename_has_async_property", {
    parser: "ts",
  });
});
