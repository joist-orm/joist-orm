import { spawn } from "child_process";
import type { PackageManager } from "./get-package-manager";

export async function install(
  packageManager: PackageManager,
  cwd: string,
): Promise<void> {
  const args: string[] = ["install"];

  return new Promise((resolve, reject) => {
    const child = spawn(packageManager, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        ADBLOCK: "1",
        DISABLE_OPENCOLLECTIVE: "1",
      },
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${packageManager} install failed with exit code ${code}`));
        return;
      }
      resolve();
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}
