import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// Load DATABASE_URL (and friends) from `.env` so the Postgres pool can connect, and hand
// them to the test workers via `test.env` (Vite only exposes VITE_-prefixed vars otherwise).
const { parsed: env } = loadDotenv();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/setupDbTests.ts"],
    // The tests share a single database, so never run test files in parallel.
    fileParallelism: false,
    env,
  },
  resolve: {
    // Codegen emits `src/...` imports and the tests use `@src/...`; map both to ./src.
    // `process.cwd()` is the package dir, since `vitest run` is invoked from here.
    alias: [
      { find: /^@src\//, replacement: `${process.cwd()}/src/` },
      { find: /^src\//, replacement: `${process.cwd()}/src/` },
    ],
  },
});
