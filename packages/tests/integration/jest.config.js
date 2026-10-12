module.exports = {
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: {
    "^src/(.*)": "<rootDir>/src/$1",
  },
  globalSetup: "<rootDir>/src/setupTestEnv.ts",
  setupFilesAfterEnv: ["<rootDir>/src/setupIt.ts", "<rootDir>/src/setupDbTests.ts"],
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  // Native-driver contracts run only with their own backend; ordinary .test files remain shared.
  testPathIgnorePatterns: [process.env.TEST_DRIVER === "sqlite" ? "\\.pg\\.test\\." : "\\.sqlite\\.test\\."],
  testEnvironment: "node",
  maxConcurrency: 1,
  resetMocks: true,
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../../artifacts",
        outputName: `junit-tests-integration-${process.env.TEST_VARIANT ?? "stock"}.xml`,
        usePathForSuiteName: "true",
      },
    ],
  ],
};
