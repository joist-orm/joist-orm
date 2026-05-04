import { defineTest } from "jscodeshift/src/testUtils";

describe("codemod_0002-rename_async_query_fields", () => {
  defineTest(__dirname, "codemod_0002-rename_async_query_fields", null, "codemod_0002-rename_async_query_fields", {
    parser: "ts",
  });
});
