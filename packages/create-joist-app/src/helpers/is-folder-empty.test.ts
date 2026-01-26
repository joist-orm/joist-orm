import fs from "fs";
import os from "os";
import path from "path";
import { isFolderEmpty } from "./is-folder-empty";

describe("isFolderEmpty", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "joist-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true for empty directory", () => {
    expect(isFolderEmpty(tempDir)).toBe(true);
  });

  it("returns false for non-empty directory", () => {
    fs.writeFileSync(path.join(tempDir, "test.txt"), "hello");
    expect(isFolderEmpty(tempDir)).toBe(false);
  });

  it("ignores allowed files like .DS_Store", () => {
    fs.writeFileSync(path.join(tempDir, ".DS_Store"), "");
    expect(isFolderEmpty(tempDir)).toBe(true);
  });

  it("ignores .git directory", () => {
    fs.mkdirSync(path.join(tempDir, ".git"));
    expect(isFolderEmpty(tempDir)).toBe(true);
  });

  it("ignores .gitignore", () => {
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "");
    expect(isFolderEmpty(tempDir)).toBe(true);
  });
});
