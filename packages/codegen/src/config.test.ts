import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { config, type Config, type FieldConfig, isFieldIgnored, loadConfig, writeConfig } from "./config";
import { makeEntity } from "./EntityDbMetadata";

describe("config", () => {
  it("defaults existing configs to codemod version 0", () => {
    expect(config.parse({}).codemodVersion).toEqual(0);
  });

  it("loads and rewrites legacy configs without the deprecated version key", async () => {
    const originalCwd = process.cwd();
    const dir = await mkdtemp(path.join(tmpdir(), "joist-config-"));

    try {
      process.chdir(dir);
      await writeFile("joist-config.json", JSON.stringify({ version: "2.0.3" }));

      const loaded = await loadConfig();
      expect(loaded.codemodVersion).toEqual(0);

      await writeConfig(loaded);
      const written = JSON.parse((await readFile("joist-config.json")).toString()) as Record<string, unknown>;
      expect(written).toMatchObject({ codemodVersion: 0 });
      expect("version" in written).toEqual(false);
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

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
      ).rejects.toThrow(
        "notNull field Author.shouldNotIgnore cannot be ignored. Alter the column to be optional or have a default value prior to ignoring it.",
      );
    });
  });
});

function newAuthorConfig(fields?: Record<string, FieldConfig>): Config {
  return config.parse({
    entities: { Author: { tag: "a", fields } },
  });
}
