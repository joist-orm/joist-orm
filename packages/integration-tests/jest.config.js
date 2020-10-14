module.exports = {
  preset: "ts-jest",
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
  },
  globalSetup: "<rootDir>/src/setupTestEnv.ts",
  setupFilesAfterEnv: ["<rootDir>/src/setupDbTests.ts"],
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  testEnvironment: "node",
  maxConcurrency: 1,
  resetMocks: true,
};
