import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import semver from "semver";

export function maybeAdjustForLocalDevelopment(pkgVersion: string): string {
  const tsconfig = path.join(__dirname, "..", "tsconfig.json");
  if (!fs.existsSync(tsconfig)) {
    return pkgVersion;
  }
  const branchName = execSync("git symbolic-ref --short HEAD", { encoding: "utf-8" });
  if (branchName.trim() === "main") {
    return pkgVersion;
  }
  const commits = execSync(`git log --oneline main..HEAD --no-merges --pretty=format:"%s"`, { encoding: "utf-8" });
  return semver.inc(pkgVersion, commits.includes("feat:") ? "major" : "minor")!;
}
