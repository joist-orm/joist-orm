import fastglob from "fast-glob";
import inquirer from "inquirer";
import { run as jscodeshift } from "jscodeshift/src/Runner";
import path from "path";
import semver from "semver";
import { maybeAdjustForLocalDevelopment } from "../adjustVersion";
import { Config } from "../config";

export async function maybeRunTransforms(config: Config): Promise<void> {
  const confVersion = config.version;
  const thisVersion = maybeAdjustForLocalDevelopment(require("../../package.json").version);
  if (semver.eq(confVersion, thisVersion)) {
    return;
  }

  const todo = findPotentialTransforms(config, confVersion);
  if (todo.length === 0) {
    // Nothing to do, but bump the version anyway
    config.version = thisVersion;
    return;
  }

  console.log(
    `Your project is on Joist ${confVersion} and there are ${todo.length} codemods to help upgrade to ${thisVersion}.`,
  );

  const { run } = await inquirer.prompt([{ name: "run", type: "confirm", message: `Would you like to run them?` }]);

  // They opted out
  if (!run) {
    config.version = thisVersion;
    return;
  }

  // Otherwise run them
  for await (const t of todo) {
    const { run } = await inquirer.prompt([
      {
        name: "run",
        type: "confirm",
        message: `Do you want to run ${t.description}?`,
      },
    ]);

    const transformPath = path.resolve(`${__dirname}/${t.name}.js`);
    const paths = await fastglob(t.glob);
    console.log(`Running ${transformPath} against ${paths.length} files`);
    console.log(`There will be a lot of jscodeshift output after this...\n\n\n`);
    const res = await jscodeshift(transformPath, paths, {
      // verbose: true,
      parser: "ts",
    });
  }

  console.log(`\n\n\nYou've been upgraded to ${thisVersion}!`);

  // Now that all codemods they wanted to run have passed, bump the version
  config.version = thisVersion;
}

function findPotentialTransforms(config: Config, prevVersion: string): Codemod[] {
  const transforms: Codemod[] = [
    {
      version: "1.143.0",
      glob: `${config.entitiesDirectory}/*.ts`,
      name: "v1_143_0_rename_derived_async_property",
      description: "Rename `hasPersistedAsyncProperty` to `hasReactiveField`",
    },
  ];
  return transforms.filter((t) => semver.lt(prevVersion, t.version));
}

type Codemod = { glob: string; version: string; name: string; description: string };
