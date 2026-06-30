#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const rootPackageJson = await readJson(path.join(root, "package.json"));
const packages = await getPublicPackages(rootPackageJson.workspaces);
const vcsOrigin = options.vcsOrigin ?? getVcsOrigin(rootPackageJson) ?? getVcsOrigin(packages[0]);

requireArg(options.orgId, "--org-id");
requireArg(options.projectId, "--project-id");
requireArg(options.pipelineDefinitionId, "--pipeline-definition-id");
requireArg(vcsOrigin, "--vcs-origin");
requireNpmTrust();

for (const packageJson of packages) {
  const args = [
    "trust",
    "circleci",
    packageJson.name,
    "--org-id",
    options.orgId,
    "--project-id",
    options.projectId,
    "--pipeline-definition-id",
    options.pipelineDefinitionId,
    "--vcs-origin",
    vcsOrigin,
    "--allow-publish",
    "--yes",
  ];

  for (const contextId of options.contextIds) {
    args.push("--context-id", contextId);
  }

  if (options.dryRun) {
    args.push("--dry-run");
  }

  console.log(`Configuring trusted publishing for ${packageJson.name}`);
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** Returns non-private workspace package manifests. */
async function getPublicPackages(workspaces) {
  const packages = [];

  for (const workspace of workspaces) {
    const packageJson = await readJson(path.join(root, workspace, "package.json"));

    if (!packageJson.private) {
      packages.push(packageJson);
    }
  }

  return packages;
}

/** Parses CLI flags for the trusted publisher setup. */
function parseArgs(args) {
  const options = { contextIds: [], dryRun: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--org-id") {
      options.orgId = args[++i];
    } else if (arg === "--project-id") {
      options.projectId = args[++i];
    } else if (arg === "--pipeline-definition-id") {
      options.pipelineDefinitionId = args[++i];
    } else if (arg === "--vcs-origin") {
      options.vcsOrigin = args[++i];
    } else if (arg === "--context-id") {
      options.contextIds.push(args[++i]);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      printUsageAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsageAndExit(1);
    }
  }

  return options;
}

/** Reads a JSON file. */
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** Returns the npm trust VCS origin from package metadata. */
function getVcsOrigin(packageJson) {
  const repository = typeof packageJson?.repository === "string" ? packageJson.repository : packageJson?.repository?.url;

  if (!repository) {
    return undefined;
  }

  return repository.replace(/^git\+/, "").replace(/^https:\/\//, "").replace(/\.git$/, "");
}

/** Ensures npm has the trust command and CircleCI flags. */
function requireNpmTrust() {
  const versionResult = spawnSync("npm", ["--version"], { cwd: root, encoding: "utf8" });
  const version = versionResult.stdout.trim();

  if (versionResult.status !== 0 || compareVersions(version, "11.10.0") < 0) {
    console.error(`npm trust requires npm@11.10.0 or newer; found npm@${version || "unknown"}.`);
    console.error("Run `npm install --global npm@latest` and then retry this command.");
    process.exit(1);
  }
}

/** Compares semver-like version strings. */
function compareVersions(a, b) {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;

    if (aPart !== bPart) {
      return aPart > bPart ? 1 : -1;
    }
  }

  return 0;
}

/** Requires a CLI option value. */
function requireArg(value, name) {
  if (!value) {
    console.error(`Missing ${name}`);
    printUsageAndExit(1);
  }
}

/** Prints usage and exits. */
function printUsageAndExit(code) {
  console.log(`Usage: yarn trust-npm-circleci --org-id <uuid> --project-id <uuid> --pipeline-definition-id <uuid> [options]

Options:
  --vcs-origin <origin>       Defaults to repository URL, e.g. github.com/joist-orm/joist-orm
  --context-id <uuid>         Optional CircleCI context restriction; repeatable
  --dry-run                   Ask npm to show what it would do
  --help                      Show this help
`);
  process.exit(code);
}
