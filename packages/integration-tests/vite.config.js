import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    threads: false,
    singleThread: true,
    globalSetup: "./src/setupTestEnv.ts",
    setupFilesAfterEnv: ["./src/setupIt.ts", "./src/setupDbTests.ts"],
    root: "src/",
  },
  esbuild: { drop: [] },
  plugins: [tsconfigPaths()],
});
