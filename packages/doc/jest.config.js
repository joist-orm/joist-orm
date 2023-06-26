module.exports = {
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
  },
  // globalSetup: "<rootDir>/src/setupTestEnv.js",
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  testEnvironment: "node",
  reporters: [
    "default",
    [
      "jest-junit",
      { outputDirectory: "../../artifacts", outputName: "junit-codegen.xml", usePathForSuiteName: "true" },
    ],
  ],
};
