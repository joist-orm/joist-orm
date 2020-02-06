module.exports = {
  preset: "ts-jest",
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
  },
  // globalSetup: "<rootDir>/src/setupTestEnv.js",
  setupFilesAfterEnv: ["<rootDir>/src/setupDbTests.ts"],
  testEnvironment: "node",
  maxConcurrency: 1,
};
