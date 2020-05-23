module.exports = {
  preset: "ts-jest",
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
  },
  // globalSetup: "<rootDir>/src/setupTestEnv.js",
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  testEnvironment: "node",
  maxConcurrency: 1,
};
