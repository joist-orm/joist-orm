import type { Config } from "@jest/types";
import { createDefaultEsmPreset } from "ts-jest";

export default {
  ...createDefaultEsmPreset(),
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  globalSetup: "<rootDir>/src/setupTestEnv.ts",
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../../artifacts",
        outputName: `junit-tests-integration-${process.env.PLUGINS ?? "stock"}.xml`,
        usePathForSuiteName: "true",
      },
    ],
  ],
} satisfies Config.InitialOptions;
