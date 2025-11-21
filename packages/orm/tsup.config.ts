import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    compilerOptions: {
      incremental: false,
      composite: false,
    },
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: "build",
});
