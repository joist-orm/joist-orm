import fs from "fs";
import path from "path";
import pc from "picocolors";
import { copyDirectory } from "./helpers/copy";
import type { PackageManager } from "./helpers/get-package-manager";
import { install } from "./helpers/install";

export interface DbConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  name: string;
}

export interface CreateAppOptions {
  projectPath: string;
  projectName: string;
  template: "basic" | "graphql";
  packageManager: PackageManager;
  skipInstall: boolean;
  dbConfig: DbConfig;
}

export async function createApp(options: CreateAppOptions): Promise<void> {
  const { projectPath, projectName, template, packageManager, skipInstall, dbConfig } = options;

  // Determine template directory
  const templateDir = path.join(__dirname, "..", "templates", template);

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template "${template}" not found at ${templateDir}`);
  }

  console.log(`Using template: ${pc.cyan(template)}`);
  console.log(`Using package manager: ${pc.cyan(packageManager)}`);
  console.log();

  // Copy template files
  console.log("Copying template files...");
  copyDirectory(templateDir, projectPath);

  // Rename gitignore to .gitignore (npm strips .gitignore when publishing)
  const gitignorePath = path.join(projectPath, "gitignore");
  const dotGitignorePath = path.join(projectPath, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    fs.renameSync(gitignorePath, dotGitignorePath);
  }

  // Rename env.template to .env
  const envTemplatePath = path.join(projectPath, "env.template");
  const dotEnvPath = path.join(projectPath, ".env");
  if (fs.existsSync(envTemplatePath)) {
    fs.renameSync(envTemplatePath, dotEnvPath);
  }

  // Process template variables in all files
  processTemplateVariables(projectPath, {
    PROJECT_NAME: projectName,
    PROJECT_NAME_UNDERSCORE: projectName.replace(/-/g, "_"),
    DB_HOST: dbConfig.host,
    DB_PORT: dbConfig.port,
    DB_USER: dbConfig.user,
    DB_PASSWORD: dbConfig.password,
    DB_NAME: dbConfig.name,
  });

  // Update package.json with project name
  const pkgJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    pkgJson.name = projectName;
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
  }

  // Add package manager specific files
  if (packageManager === "yarn") {
    fs.writeFileSync(
      path.join(projectPath, ".yarnrc.yml"),
      "nodeLinker: node-modules\n",
    );
  }

  // Install dependencies
  if (!skipInstall) {
    console.log();
    console.log("Installing dependencies...");
    console.log();
    await install(packageManager, projectPath);
  }
}

function processTemplateVariables(
  dirPath: string,
  variables: Record<string, string>,
): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .git
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        processTemplateVariables(fullPath, variables);
      }
    } else if (isTextFile(entry.name)) {
      let content = fs.readFileSync(fullPath, "utf-8");
      let modified = false;

      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        if (content.includes(placeholder)) {
          content = content.split(placeholder).join(value);
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

function isTextFile(filename: string): boolean {
  const textExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".env",
    ".gitignore",
    ".dockerignore",
    ".sql",
    ".graphql",
    ".gql",
    ".sh",
    ".template",
  ];

  const basename = path.basename(filename).toLowerCase();

  // Handle dotfiles and files without extensions
  if (
    basename === "dockerfile" ||
    basename === "gitignore" ||
    basename === "env.template" ||
    basename === ".env"
  ) {
    return true;
  }

  const ext = path.extname(filename).toLowerCase();
  return textExtensions.includes(ext);
}
