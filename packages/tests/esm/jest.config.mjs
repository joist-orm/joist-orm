export default {
  extensionsToTreatAsEsm: [".ts", ".tsx", ".mts"],
  transform: { "^.+\\.m?tsx?$": "@swc/jest" },
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  globalSetup: "<rootDir>/src/setupTestEnv.ts",
  setupFilesAfterEnv: ["<rootDir>/src/setupIt.ts", "<rootDir>/src/setupDbTests.ts"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^src/(.*).js": "<rootDir>/src/$1",
  },
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../../artifacts",
        outputName: `junit-tests-esm.xml`,
        usePathForSuiteName: "true",
      },
    ],
  ],
};
