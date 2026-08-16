import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { sep } from "node:path";

const require = createRequire(import.meta.url);
const entryPoints = [
  "joist-codegen",
  "joist-core",
  "joist-graphql-codegen",
  "joist-graphql-resolver-utils",
  "joist-graphql-resolver-utils/index.js",
  "joist-graphql-resolver-utils/tests",
  "joist-knex",
  "joist-migration-utils",
  "joist-orm",
  "joist-orm/codegen",
  "joist-orm/graphql",
  "joist-orm/graphql-codegen",
  "joist-orm/knex",
  "joist-orm/pg",
  "joist-orm/pg-migrate",
  "joist-orm/tests",
  "joist-test-utils",
  "joist-utils",
];
if (process.versions.bun) entryPoints.push("joist-driver-bun-pg");

for (const entryPoint of entryPoints) {
  const imported = await import(entryPoint);
  const required = require(entryPoint);
  assert.strictEqual(required, imported, `${entryPoint} loaded separate CommonJS and ESM instances`);
  const resolved = require.resolve(entryPoint);
  assert.ok(
    resolved.includes(`${sep}build${sep}`) && resolved.endsWith(".js"),
    `${entryPoint} did not resolve through module-sync`,
  );
}
