import { execSync } from "child_process";
import path from "path";
import fs from "fs";

function isInGitRepository(cwd: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isInMercurialRepository(cwd: string): boolean {
  try {
    execSync("hg --cwd . root", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function tryGitInit(cwd: string): boolean {
  let didInit = false;

  try {
    execSync("git --version", { stdio: "ignore" });

    if (isInGitRepository(cwd) || isInMercurialRepository(cwd)) {
      return false;
    }

    execSync("git init", { cwd, stdio: "ignore" });
    didInit = true;

    execSync("git checkout -b main", { cwd, stdio: "ignore" });

    return true;
  } catch {
    if (didInit) {
      try {
        fs.rmSync(path.join(cwd, ".git"), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    return false;
  }
}

export function tryGitCommit(cwd: string): boolean {
  try {
    execSync("git add -A", { cwd, stdio: "ignore" });
    execSync('git commit -m "Initial commit from create-joist-app"', {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
