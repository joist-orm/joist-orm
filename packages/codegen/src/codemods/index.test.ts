import { findApplicableCodemods, getLatestCodemodVersion } from ".";

describe("codemods", () => {
  it("returns the latest codemod version", () => {
    expect(getLatestCodemodVersion()).toEqual(2);
  });

  it("finds codemods after the stored codemod version", () => {
    expect(findApplicableCodemods(0)).toMatchObject([
      { codemodVersion: 1, name: "codemod_0001-rename_has_async_property" },
      { codemodVersion: 2, name: "codemod_0002-rename_async_query_fields" },
    ]);
    expect(findApplicableCodemods(1)).toMatchObject([
      { codemodVersion: 2, name: "codemod_0002-rename_async_query_fields" },
    ]);
    expect(findApplicableCodemods(2)).toEqual([]);
  });
});
