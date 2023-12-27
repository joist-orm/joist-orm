module.exports = {
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
    "^src/(.*)": "<rootDir>/src/$1",
  },
  globalSetup: "<rootDir>/src/setupTestEnv.ts",
  // Importing testEm from jest-integration-tests also imports setupDbTests, so we can skip this
  // setupFilesAfterEnv: ["<rootDir>/src/setupDbTests.ts"],
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  testEnvironment: "node",
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../../artifacts",
        outputName: "junit-plugins-rebac-auth.xml",
        usePathForSuiteName: "true",
      },
    ],
  ],
};
