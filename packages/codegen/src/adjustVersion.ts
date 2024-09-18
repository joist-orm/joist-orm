import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import semver from "semver";

/**
 * When developing against Joist itself, we predict what the next version will be.
 *
 * I.e. if we're on a feature branch, the current `package.json` will still have (say)
 * `1.100.5`, but if we're developing a codemod that will be new in `1.101.0`, we want
 * the version detection logic to know what this "after we are merged" version will be,
 * so it can invoke it against our working copy for testing/migration purposes, and then
 * end up with the right `version: "1.101.0"` written back to each test package's
 * `joist-config.json` file.
 */
export function maybeAdjustForLocalDevelopment(pkgVersion: string): string {
  // We don't publish `tsconfig.json` to npm, so use that to detect if we're a local working copy
  // ...this probably won't work with the `watch-joist.sh` approach...
  // An alternative would be to be pre-emptively bump the `package.json` version of the local
  // working copy.
  const tsconfig = path.join(__dirname, "..", "tsconfig.json");
  if (!fs.existsSync(tsconfig)) {
    return pkgVersion;
  }
  // If we're on main, the package.version will have been bumped already by `set-versions.sh`
  try {
    const branchName = execSync("git symbolic-ref --short HEAD", { encoding: "utf-8" });
    if (branchName.trim() === "main") {
      return pkgVersion;
    }
    // Otherwise look for a `feat:` commit message to guess minor/patch version bump
    const commits = execSync(`git log --oneline main..HEAD --no-merges --pretty=format:"%s"`, { encoding: "utf-8" });
    return semver.inc(pkgVersion, commits.includes("feat:") ? "minor" : "patch")!;
  } catch (e) {
    return pkgVersion;
  }
}
