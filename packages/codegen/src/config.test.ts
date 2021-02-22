import { Config, defaultConfig, FieldConfig, isFieldIgnored } from "./config";
import { makeEntity } from "./EntityDbMetadata";

describe("config", () => {
  describe("isFieldIgnored", () => {
    // A little hack to test the case of `ignore: false`, since it is actually defined as `ignore?: true`
    const falseAsTrue = (false as boolean) as true;

    it.each([
      ["fields key is omitted all together", newAuthorConfig()],
      ["fields does not specify the field in question", newAuthorConfig({})],
      ["field is specified but doesn't have ignore key", newAuthorConfig({ shouldNotIgnore: {} })],
      ["field is specified but has ignore: false", newAuthorConfig({ shouldNotIgnore: { ignore: falseAsTrue } })],
    ])("indicates the field is not ignored when %s", (_message: string, config: Config) => {
      expect(isFieldIgnored(config, makeEntity("Author"), "shouldNotIgnore", true)).toEqual(false);
    });

    it("indicates the field is ignored when the field is not required and configured with ignore: true", () => {
      expect(
        isFieldIgnored(
          newAuthorConfig({ shouldIgnore: { ignore: true } }),
          makeEntity("Author"),
          "shouldIgnore",
          false,
        ),
      ).toEqual(true);
    });

    it("fails if the ignored key is not nullable", async () => {
      await expect(async () =>
        isFieldIgnored(
          newAuthorConfig({ shouldNotIgnore: { ignore: true } }),
          makeEntity("Author"),
          "shouldNotIgnore",
          true,
        ),
      ).rejects.toThrowError("notNull fields cannot be ignored. Alter the column to be optional prior to ignoring it.");
    });
  });
});

function newAuthorConfig(fields?: Record<string, FieldConfig>): Config {
  return {
    ...defaultConfig,
    entities: { Author: { tag: "a", fields } },
  };
}
