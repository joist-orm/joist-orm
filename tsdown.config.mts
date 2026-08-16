import { defineConfig } from "tsdown";

export default defineConfig({
  workspace: {
    include: [
      "packages/codegen",
      "packages/core",
      "packages/drivers/bun-pg",
      "packages/graphql-codegen",
      "packages/graphql-resolver-utils",
      "packages/knex",
      "packages/migration-utils",
      "packages/orm",
      "packages/test-utils",
      "packages/utils",
    ],
  },
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/__tests__/**", "!src/**/__testfixtures__/**"],
  root: "src",
  outDir: "build",
  format: ["esm", "cjs"],
  target: "es2022",
  platform: "node",
  unbundle: true,
  dts: { sourcemap: true },
  deps: { neverBundle: true },
  sourcemap: true,
  outExtensions(options) {
    return options.format === "cjs" ? { js: ".cjs", dts: ".d.cts" } : { js: ".js", dts: ".d.mts" };
  },
  outputOptions: { exports: "named" },
  hash: false,
  report: false,
});
