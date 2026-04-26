import { type Config } from "../config";
import { type Codemod } from "./Codemod";
import { codemod_0001_rename_has_async_property } from "./codemod_0001-rename_has_async_property";

const codemods: Codemod[] = [codemod_0001_rename_has_async_property];

/** Prompts for and runs pending codemods for the user's project. */
export async function maybeRunTransforms(config: Config): Promise<void> {
  const { confirm } = await import("@inquirer/prompts");
  const configCodemodVersion = config.codemodVersion;
  const latestCodemodVersion = getLatestCodemodVersion();

  if (configCodemodVersion >= latestCodemodVersion) {
    return;
  }

  const mods = findApplicableCodemods(configCodemodVersion);
  if (mods.length === 0) {
    config.codemodVersion = latestCodemodVersion;
    return;
  }

  console.log(
    `Your project is on Joist codemod version ${configCodemodVersion} and there ${mods.length === 1 ? "is" : "are"} ${mods.length} codemod${mods.length === 1 ? "" : "s"} to apply.`,
  );

  const run = await confirm({
    message: `Would you like to run them?`,
  });

  if (!run) {
    config.codemodVersion = latestCodemodVersion;
    return;
  }

  for (const mod of mods) {
    const run = await confirm({
      message: `Do you want to run ${mod.description}?`,
    });
    if (!run) continue;
    await mod.run(config);
  }

  console.log(`\n\n\nYou've been upgraded to Joist codemod version ${latestCodemodVersion}!`);

  config.codemodVersion = latestCodemodVersion;
}

/** Returns the highest codemod counter known by this version of codegen. */
export function getLatestCodemodVersion(): number {
  return codemods[codemods.length - 1]?.codemodVersion ?? 0;
}

/** Returns codemods that have not yet been applied to the user's project. */
export function findApplicableCodemods(codemodVersion: number): Codemod[] {
  return codemods.filter((codemod) => codemod.codemodVersion > codemodVersion);
}
