/** @type {import('jest').Config} */
module.exports = {
  transform: {
    "^.+\\.tsx?$": "@swc/jest",
  },
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  testEnvironment: "node",
  globalSetup: "./src/setupTestEnv.ts",
  setupFilesAfterEnv: ["./src/setupTests.ts"],
  maxWorkers: 1,
};
