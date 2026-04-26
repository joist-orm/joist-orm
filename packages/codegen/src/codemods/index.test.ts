import { findApplicableCodemods, getLatestCodemodVersion } from ".";

describe("codemods", () => {
  it("returns the latest codemod version", () => {
    expect(getLatestCodemodVersion()).toEqual(1);
  });

  it("finds codemods after the stored codemod version", () => {
    expect(findApplicableCodemods(0)).toMatchObject([
      { codemodVersion: 1, name: "codemod_0001-rename_has_async_property" },
    ]);
    expect(findApplicableCodemods(1)).toEqual([]);
  });
});
