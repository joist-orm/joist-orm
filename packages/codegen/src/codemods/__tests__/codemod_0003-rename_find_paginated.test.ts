import { defineTest } from "jscodeshift/src/testUtils";

describe("codemod_0003-rename_find_paginated", () => {
  defineTest(__dirname, "codemod_0003-rename_find_paginated", null, "codemod_0003-rename_find_paginated", {
    parser: "ts",
  });
});
