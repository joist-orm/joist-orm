import semver from "semver";
import { maybeAdjustForLocalDevelopment } from "../adjustVersion";
import { Config } from "../config";
import { Codemod } from "./Codemod";
import { v1_143_0_rename_derived_async_property } from "./v1_143_0_rename_derived_async_property";
import { v1_148_0_move_codegen_files } from "./v1_148_0_move_codegen_files";
import { v1_151_0_rename_derived_reference } from "./v1_151_0_rename_derived_async_reference";
import { v1_226_0_rename_current_txn_knex } from "./v1_226_0_rename_current_txn_knex";
import { v1_245_0_upsert_rename } from "./v1_245_0_upsert_rename";

export async function maybeRunTransforms(config: Config): Promise<void> {
  const { default: inquirer } = await import("inquirer");
  const confVersion = config.version;

  // Look for `0.0.1` as a hint that a) we're running in the Joist repo and
  // b) aren't manually testing any transformers, so just early return.
  if (confVersion === "0.0.1") return;
  // If this is a brand-new project, ofc nothing to do
  if (confVersion === "0.0.0") return;

  const thisVersion = getThisVersion();
  if (semver.eq(confVersion, thisVersion)) {
    return;
  }

  const mods = findApplyableCodemods(confVersion);
  if (mods.length === 0) {
    // Nothing to do, but bump the version anyway
    config.version = thisVersion;
    return;
  }

  console.log(
    `Your project is on Joist ${confVersion} and there are ${mods.length} codemods to help upgrade to ${thisVersion}.`,
  );

  const run = await inquirer.prompt({
    name: "run",
    type: "confirm",
    message: `Would you like to run them?`,
  });

  // They opted out
  if (!run) {
    config.version = thisVersion;
    return;
  }

  // Otherwise run them
  for (const mod of mods) {
    const run = await inquirer.prompt({
      name: "run",
      type: "confirm",
      message: `Do you want to run ${mod.description}?`,
    });
    if (!run) continue;
    await mod.run(config);
  }

  console.log(`\n\n\nYou've been upgraded to ${thisVersion}!`);

  // Now that all codemods they wanted to run have passed, bump the version
  config.version = thisVersion;
}

export function getThisVersion(): string {
  // Assume we're at `./node_modules/joist-codegen/build/index.js`, so `../../package.json`
  // will be our own `joist-codegen/package.json` with the version the user has installed.
  return maybeAdjustForLocalDevelopment(require("../../package.json").version);
}

function findApplyableCodemods(prevVersion: string): Codemod[] {
  return [
    v1_143_0_rename_derived_async_property,
    v1_148_0_move_codegen_files,
    v1_151_0_rename_derived_reference,
    v1_226_0_rename_current_txn_knex,
    v1_245_0_upsert_rename,
  ].filter((t) => semver.lt(prevVersion, t.version));
}
