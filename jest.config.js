module.exports = {
  preset: "ts-jest",
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
  },
  // globalSetup: "<rootDir>/src/setupTestEnv.js",
  // setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.test.(ts|tsx)"],
  reporters: ["default", "jest-summary-reporter"],
};
