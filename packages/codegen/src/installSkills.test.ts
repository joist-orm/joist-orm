import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { installSkills } from "./installSkills";

/** Mirror of `installSkills.ts`'s bundled skills dir, so tests stay in sync with what actually ships. */
const bundledSkillsDir = resolve(__dirname, "../skills");

let testDir: string;
let logs: string[];
let logSpy: jest.SpyInstance;

beforeEach(async () => {
  testDir = await fs.mkdtemp(join(tmpdir(), "joist-skills-test-"));
  logs = [];
  logSpy = jest.spyOn(console, "log").mockImplementation((m) => void logs.push(String(m)));
});

afterEach(async () => {
  logSpy.mockRestore();
  await fs.rm(testDir, { recursive: true, force: true });
});

describe("installSkills", () => {
  it("copies bundled skills into both .claude and .agents", async () => {
    await installSkills(testDir);

    const bundled = await bundledSkillNames();
    for (const target of [".claude/skills", ".agents/skills"]) {
      const names = (await fs.readdir(join(testDir, target))).sort();
      expect(names).toEqual(bundled);
    }

    const skill = await fs.readFile(join(testDir, ".claude/skills/joist-em-basics/SKILL.md"), "utf-8");
    expect(skill).toContain("name: joist-em-basics");
  });

  it("overwrites a previously-installed skill", async () => {
    const dest = join(testDir, ".claude/skills/joist-em-basics");
    await fs.mkdir(dest, { recursive: true });
    await fs.writeFile(join(dest, "SKILL.md"), "stale", "utf-8");

    await installSkills(testDir);

    const skill = await fs.readFile(join(dest, "SKILL.md"), "utf-8");
    expect(skill).toContain("name: joist-em-basics");
  });

  it("logs added and removed skills by name", async () => {
    const bundled = await bundledSkillNames();
    // Pre-seed every bundled skill except the last, plus a stale Joist skill, in both targets.
    const preinstalled = bundled.slice(0, -1);
    const newSkill = bundled[bundled.length - 1];
    for (const target of [".claude/skills", ".agents/skills"]) {
      for (const name of [...preinstalled, "joist-old"]) {
        await fs.mkdir(join(testDir, target, name), { recursive: true });
      }
    }

    await installSkills(testDir);

    expect(logs).toEqual([
      "Added 1 Joist skill(s) to .claude/skills and .agents/skills:",
      `  + ${newSkill}`,
      "Removed 1 stale Joist skill(s) from .claude/skills and .agents/skills:",
      "  - joist-old",
    ]);
  });

  it("prunes stale Joist skills but leaves user-owned skills alone", async () => {
    for (const name of ["joist-old", "my-custom"]) {
      await fs.mkdir(join(testDir, ".claude/skills", name), { recursive: true });
    }

    await installSkills(testDir);

    const bundled = await bundledSkillNames();
    const claude = (await fs.readdir(join(testDir, ".claude/skills"))).sort();
    expect(claude).toEqual([...bundled, "my-custom"].sort());
  });

  it("stays quiet when nothing changed", async () => {
    const bundled = await bundledSkillNames();
    for (const target of [".claude/skills", ".agents/skills"]) {
      for (const name of bundled) await fs.mkdir(join(testDir, target, name), { recursive: true });
    }

    await installSkills(testDir);

    expect(logs).toEqual([]);
  });
});

/** The bundled skill directory names, sorted. I.e. ["joist-em-basics", ...]. */
async function bundledSkillNames(): Promise<string[]> {
  const entries = await fs.readdir(bundledSkillsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
