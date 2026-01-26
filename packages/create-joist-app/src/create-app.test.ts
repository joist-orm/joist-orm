import fs from "fs";
import os from "os";
import path from "path";
import { createApp } from "./create-app";

describe("createApp", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-joist-app-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("basic template", () => {
    it("creates all expected files", async () => {
      const projectPath = path.join(tempDir, "test-project");
      fs.mkdirSync(projectPath);

      await createApp({
        projectPath,
        projectName: "test-project",
        template: "basic",
        packageManager: "yarn",
        skipInstall: true,
        dbConfig: {
          host: "localhost",
          port: "5432",
          user: "test_user",
          password: "test_password",
          name: "test_db",
        },
      });

      // Check essential files exist
      expect(fs.existsSync(path.join(projectPath, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "tsconfig.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "jest.config.js"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "joist-config.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "docker-compose.yml"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, ".env"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, ".gitignore"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, ".yarnrc.yml"))).toBe(true);

      // Check source files
      expect(fs.existsSync(path.join(projectPath, "src/context.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/entities/Author.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/entities/Book.ts"))).toBe(true);

      // Check migrations
      expect(fs.existsSync(path.join(projectPath, "migrations"))).toBe(true);
      const migrations = fs.readdirSync(path.join(projectPath, "migrations"));
      expect(migrations.length).toBeGreaterThan(0);
    });

    it("substitutes template variables", async () => {
      const projectPath = path.join(tempDir, "my-app");
      fs.mkdirSync(projectPath);

      await createApp({
        projectPath,
        projectName: "my-app",
        template: "basic",
        packageManager: "yarn",
        skipInstall: true,
        dbConfig: {
          host: "localhost",
          port: "5432",
          user: "my_app_user",
          password: "secret",
          name: "my_app_db",
        },
      });

      // Check package.json has project name
      const pkgJson = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
      expect(pkgJson.name).toBe("my-app");

      // Check .env has correct database URL
      const envContent = fs.readFileSync(path.join(projectPath, ".env"), "utf-8");
      expect(envContent).toContain("my_app_user");
      expect(envContent).toContain("my_app_db");
      expect(envContent).toContain("secret");

      // Check docker-compose has correct user
      const dockerCompose = fs.readFileSync(path.join(projectPath, "docker-compose.yml"), "utf-8");
      expect(dockerCompose).toContain("my_app_user");
      expect(dockerCompose).toContain("my_app_db");
    });

    it("does not create .yarnrc.yml for npm", async () => {
      const projectPath = path.join(tempDir, "npm-project");
      fs.mkdirSync(projectPath);

      await createApp({
        projectPath,
        projectName: "npm-project",
        template: "basic",
        packageManager: "npm",
        skipInstall: true,
        dbConfig: {
          host: "localhost",
          port: "5432",
          user: "test_user",
          password: "test_password",
          name: "test_db",
        },
      });

      expect(fs.existsSync(path.join(projectPath, ".yarnrc.yml"))).toBe(false);
    });
  });

  describe("graphql template", () => {
    it("creates all expected files", async () => {
      const projectPath = path.join(tempDir, "graphql-project");
      fs.mkdirSync(projectPath);

      await createApp({
        projectPath,
        projectName: "graphql-project",
        template: "graphql",
        packageManager: "yarn",
        skipInstall: true,
        dbConfig: {
          host: "localhost",
          port: "5432",
          user: "test_user",
          password: "test_password",
          name: "test_db",
        },
      });

      // Check basic files
      expect(fs.existsSync(path.join(projectPath, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "joist-config.json"))).toBe(true);

      // Check GraphQL-specific files
      expect(fs.existsSync(path.join(projectPath, "codegen.yml"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/schema.graphql"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/server.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/resolvers/index.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/resolvers/authorResolvers.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectPath, "src/resolvers/bookResolvers.ts"))).toBe(true);
    });

    it("includes graphql codegen plugin in joist-config", async () => {
      const projectPath = path.join(tempDir, "graphql-project");
      fs.mkdirSync(projectPath);

      await createApp({
        projectPath,
        projectName: "graphql-project",
        template: "graphql",
        packageManager: "yarn",
        skipInstall: true,
        dbConfig: {
          host: "localhost",
          port: "5432",
          user: "test_user",
          password: "test_password",
          name: "test_db",
        },
      });

      const joistConfig = JSON.parse(
        fs.readFileSync(path.join(projectPath, "joist-config.json"), "utf-8"),
      );
      expect(joistConfig.codegenPlugins).toContain("joist-graphql-codegen");
    });

    it("includes apollo server dependency", async () => {
      const projectPath = path.join(tempDir, "graphql-project");
      fs.mkdirSync(projectPath);

      await createApp({
        projectPath,
        projectName: "graphql-project",
        template: "graphql",
        packageManager: "yarn",
        skipInstall: true,
        dbConfig: {
          host: "localhost",
          port: "5432",
          user: "test_user",
          password: "test_password",
          name: "test_db",
        },
      });

      const pkgJson = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
      expect(pkgJson.dependencies["@apollo/server"]).toBeDefined();
      expect(pkgJson.dependencies["graphql"]).toBeDefined();
    });
  });
});
