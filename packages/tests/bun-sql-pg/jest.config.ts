import type { Config } from "@jest/types";
import { createDefaultEsmPreset } from "ts-jest";

export default {
  ...createDefaultEsmPreset({ isolatedModules: true }),
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  globalSetup: "<rootDir>/src/setupTestEnv.ts",
  testEnvironment: "node",
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../../artifacts",
        outputName: `junit-tests-bun-sql-pg.xml`,
        usePathForSuiteName: "true",
      },
    ],
  ],
  // ...we shouldn't need this b/c of package.json#imports?
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
} satisfies Config.InitialOptions;
