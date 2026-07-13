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

/**
 * Copies Joist's bundled Agent Skills into the project so coding agents can
 * discover them.
 *
 * The skills are framework-owned and rewritten on every codegen run, so users
 * should not hand-edit them (re-run codegen to pick up new Joist versions).
 */
export async function installSkills(rootDir: string = "."): Promise<void> {
  let skillNames: string[];
  try {
    const entries = await fs.readdir(bundledSkillsDir, { withFileTypes: true });
    skillNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    // The bundled skills are missing (e.g. running against an unbuilt package); nothing to do.
    return;
  }
  if (skillNames.length === 0) return;

  await Promise.all(
    skillTargets.flatMap((target) =>
      skillNames.map((name) =>
        fs.cp(join(bundledSkillsDir, name), join(rootDir, target, name), { recursive: true, force: true }),
      ),
    ),
  );

  console.log(`Installed ${skillNames.length} Joist skill(s) into ${skillTargets.join(" and ")}`);
}
