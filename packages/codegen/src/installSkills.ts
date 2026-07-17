import { promises as fs } from "fs";
import { join, resolve } from "path";

/** The bundled skills live at the package root, alongside `build`/`src`. */
const bundledSkillsDir = resolve(__dirname, "../skills");

/**
 * Targets that each get a full copy of every skill directory.
 *
 * `.claude/skills` is read by Claude Code (and opencode); `.agents/skills` is read
 * by Codex (and opencode), so writing both gives native coverage across all three.
 */
const skillTargets = [".claude/skills", ".agents/skills"];

/** Joist owns the `joist-` skill namespace, so stale ones there are ours to prune. */
const skillPrefix = "joist-";

/**
 * Copies Joist's bundled Agent Skills into the project so coding agents can
 * discover them, then prunes any previously-installed Joist skills that no
 * longer ship with this version.
 *
 * The skills are framework-owned and rewritten on every codegen run, so users
 * should not hand-edit them (re-run codegen to pick up new Joist versions).
 *
 * Logs only what actually changed: the added and removed skill names, staying
 * quiet when nothing changed.
 */
export async function installSkills(rootDir: string = "."): Promise<void> {
  const bundled = await readSkillNames(bundledSkillsDir);
  if (bundled.length === 0) return;
  const bundledSet = new Set(bundled);

  // Snapshot what each target already has before we copy/remove, so we can diff.
  const existingPerTarget = await Promise.all(skillTargets.map((target) => readSkillNames(join(rootDir, target))));

  // Always `cp` the bundled skills into each target, overwriting any existing ones
  await Promise.all(
    skillTargets.flatMap((target) =>
      bundled.map((name) =>
        fs.cp(join(bundledSkillsDir, name), join(rootDir, target, name), { recursive: true, force: true }),
      ),
    ),
  );

  // Prune stale Joist skills (previously installed here, but no longer bundled).
  const removed = new Set<string>();
  await Promise.all(
    skillTargets.map(async (target, i) => {
      const stale = existingPerTarget[i].filter((name) => name.startsWith(skillPrefix) && !bundledSet.has(name));
      await Promise.all(
        stale.map(async (name) => {
          removed.add(name);
          await fs.rm(join(rootDir, target, name), { recursive: true, force: true });
        }),
      );
    }),
  );

  // A skill is "new" if it was missing from at least one target before this run.
  const added = bundled.filter((name) => existingPerTarget.some((names) => !names.includes(name)));

  if (added.length > 0) {
    console.log(`Added ${added.length} Joist skill(s) to ${skillTargets.join(" and ")}:`);
    for (const name of added) console.log(`  + ${name}`);
  }
  if (removed.size > 0) {
    console.log(`Removed ${removed.size} stale Joist skill(s) from ${skillTargets.join(" and ")}:`);
    for (const name of removed) console.log(`  - ${name}`);
  }
}

/** Lists the skill directory names in a dir, or `[]` if it's missing. I.e. ["joist-upsert", ...]. */
async function readSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
