import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { installSkills } from "./installSkills";

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(join(tmpdir(), "joist-skills-test-"));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe("installSkills", () => {
  it("copies bundled skills into both .claude and .agents", async () => {
    await installSkills(testDir);

    for (const target of [".claude/skills", ".agents/skills"]) {
      const names = (await fs.readdir(join(testDir, target))).sort();
      expect(names).toMatchObject(["joist-em-basics", "joist-upsert"]);
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
});
