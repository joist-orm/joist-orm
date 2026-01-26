#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import prompts from "prompts";
import validateNpmPackageName from "validate-npm-package-name";
import { createApp } from "./create-app";
import { getPackageManager, type PackageManager } from "./helpers/get-package-manager";
import { isFolderEmpty } from "./helpers/is-folder-empty";
import { isWriteable } from "./helpers/is-writeable";
import path from "path";
import fs from "fs";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
);

type Template = "basic" | "graphql";

interface Options {
  template?: Template;
  useYarn?: boolean;
  useNpm?: boolean;
  usePnpm?: boolean;
  useBun?: boolean;
  skipInstall?: boolean;
  yes?: boolean;
  dbHost?: string;
  dbPort?: string;
  dbUser?: string;
  dbPassword?: string;
  dbName?: string;
}

async function main() {
  const program = new Command()
    .name("create-joist-app")
    .version(packageJson.version)
    .description("Create a new Joist ORM project")
    .argument("[project-directory]", "Directory to create the project in")
    .option("-t, --template <template>", "Template to use (basic, graphql)", "basic")
    .option("--use-yarn", "Use Yarn as the package manager")
    .option("--use-npm", "Use npm as the package manager")
    .option("--use-pnpm", "Use pnpm as the package manager")
    .option("--use-bun", "Use Bun as the package manager")
    .option("--skip-install", "Skip installing dependencies")
    .option("-y, --yes", "Use default options (non-interactive mode)")
    .option("--db-host <host>", "Database host", "localhost")
    .option("--db-port <port>", "Database port", "5432")
    .option("--db-user <user>", "Database user")
    .option("--db-password <password>", "Database password", "local")
    .option("--db-name <name>", "Database name")
    .parse(process.argv);

  const opts = program.opts<Options>();
  let projectPath = program.args[0];

  console.log();
  console.log(pc.bold(pc.cyan("create-joist-app")), pc.gray(`v${packageJson.version}`));
  console.log();

  // Handle ctrl+c gracefully
  prompts.override({ onCancel: () => process.exit(1) });

  // Prompt for project directory if not provided
  if (!projectPath) {
    if (opts.yes) {
      console.error(pc.red("Error: Project directory is required in non-interactive mode"));
      process.exit(1);
    }

    const response = await prompts({
      type: "text",
      name: "projectPath",
      message: "What is your project named?",
      initial: "my-joist-app",
      validate: (value: string) => {
        const validation = validateNpmPackageName(path.basename(value));
        if (!validation.validForNewPackages) {
          return `Invalid project name: ${validation.errors?.[0] || validation.warnings?.[0]}`;
        }
        return true;
      },
    });

    if (!response.projectPath) {
      console.log(pc.red("Cancelled."));
      process.exit(1);
    }

    projectPath = response.projectPath;
  }

  // Resolve absolute path
  const resolvedPath = path.resolve(projectPath);
  const projectName = path.basename(resolvedPath);

  // Validate project name
  const validation = validateNpmPackageName(projectName);
  if (!validation.validForNewPackages) {
    console.error(pc.red(`Invalid project name "${projectName}"`));
    console.error(pc.red(validation.errors?.[0] || validation.warnings?.[0] || "Unknown error"));
    process.exit(1);
  }

  // Check if directory is writeable
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    console.error(pc.red(`Parent directory does not exist: ${parentDir}`));
    process.exit(1);
  }

  if (!(await isWriteable(parentDir))) {
    console.error(pc.red(`Cannot write to directory: ${parentDir}`));
    process.exit(1);
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
  }

  // Check if directory is empty
  if (!isFolderEmpty(resolvedPath)) {
    console.error(pc.red(`Directory is not empty: ${resolvedPath}`));
    process.exit(1);
  }

  // Determine template
  let template: Template = (opts.template as Template) || "basic";
  if (!opts.yes && !opts.template) {
    const response = await prompts({
      type: "select",
      name: "template",
      message: "Which template would you like to use?",
      choices: [
        { title: "Basic", value: "basic", description: "A minimal Joist project with entities" },
        {
          title: "GraphQL",
          value: "graphql",
          description: "Joist with GraphQL server and resolvers",
        },
      ],
      initial: 0,
    });

    if (!response.template) {
      console.log(pc.red("Cancelled."));
      process.exit(1);
    }

    template = response.template;
  }

  // Determine package manager
  let packageManager: PackageManager;
  if (opts.useYarn) {
    packageManager = "yarn";
  } else if (opts.useNpm) {
    packageManager = "npm";
  } else if (opts.usePnpm) {
    packageManager = "pnpm";
  } else if (opts.useBun) {
    packageManager = "bun";
  } else {
    packageManager = getPackageManager();
  }

  // Get database configuration
  let dbConfig = {
    host: opts.dbHost || "localhost",
    port: opts.dbPort || "5432",
    user: opts.dbUser || projectName.replace(/-/g, "_") + "_user",
    password: opts.dbPassword || "local",
    name: opts.dbName || projectName.replace(/-/g, "_"),
  };

  if (!opts.yes) {
    const response = await prompts([
      {
        type: "text",
        name: "dbName",
        message: "Database name:",
        initial: dbConfig.name,
      },
      {
        type: "text",
        name: "dbUser",
        message: "Database user:",
        initial: dbConfig.user,
      },
    ]);

    if (response.dbName === undefined) {
      console.log(pc.red("Cancelled."));
      process.exit(1);
    }

    dbConfig = {
      ...dbConfig,
      name: response.dbName || dbConfig.name,
      user: response.dbUser || dbConfig.user,
    };
  }

  console.log();
  console.log(`Creating a new Joist app in ${pc.green(resolvedPath)}`);
  console.log();

  try {
    await createApp({
      projectPath: resolvedPath,
      projectName,
      template,
      packageManager,
      skipInstall: opts.skipInstall || false,
      dbConfig,
    });

    console.log();
    console.log(pc.green("Success!"), `Created ${pc.bold(projectName)} at ${resolvedPath}`);
    console.log();
    console.log("Inside that directory, you can run several commands:");
    console.log();
    console.log(pc.cyan(`  ${packageManager}${packageManager === "npm" ? " run" : ""} db`));
    console.log("    Start the database, run migrations, and generate code.");
    console.log();
    console.log(pc.cyan(`  ${packageManager}${packageManager === "npm" ? " run" : ""} test`));
    console.log("    Run the test suite.");
    console.log();
    console.log(pc.cyan(`  ${packageManager}${packageManager === "npm" ? " run" : ""} build`));
    console.log("    Build the project for production.");
    console.log();
    console.log("We suggest that you begin by typing:");
    console.log();
    console.log(pc.cyan(`  cd ${projectPath}`));
    console.log(pc.cyan(`  ${packageManager}${packageManager === "npm" ? " run" : ""} db`));
    console.log();
  } catch (error) {
    console.error(pc.red("Error creating project:"));
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
