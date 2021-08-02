import { Config, defaultConfig, FieldConfig, isFieldIgnored } from "./config";
import { makeEntity } from "./EntityDbMetadata";

describe("config", () => {
  describe("isFieldIgnored", () => {
    // A little hack to test the case of `ignore: false`, since it is actually defined as `ignore?: true`
    const falseAsTrue = false as boolean as true;

    it.each([
      ["does not ignore when no config is provided", newAuthorConfig()],
      ["does not ignore when FieldConfig for fieldName is not specified", newAuthorConfig({})],
      ["does not ignore when FieldConfig.fieldName has ignore unset", newAuthorConfig({ fieldName: {} })],
      [
        "does not ignore when FieldConfig.fieldName has ignore: false",
        newAuthorConfig({ fieldName: { ignore: falseAsTrue } }),
      ],
    ])("%s", (_message: string, config: Config) => {
      expect(isFieldIgnored(config, makeEntity("Author"), "fieldName", true)).toEqual(false);
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

    it("indicates the field is ignored when the field is required but has a default value and configured with ignore: true", () => {
      expect(
        isFieldIgnored(
          newAuthorConfig({ shouldIgnore: { ignore: true } }),
          makeEntity("Author"),
          "shouldIgnore",
          true,
          true,
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
      ).rejects.toThrowError(
        "notNull fields cannot be ignored. Alter the column to be optional or have a default value prior to ignoring it.",
      );
    });
  });
});

function newAuthorConfig(fields?: Record<string, FieldConfig>): Config {
  return {
    ...defaultConfig,
    entities: { Author: { tag: "a", fields } },
  };
}
