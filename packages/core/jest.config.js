module.exports = {
  transform: { "^.+\\.tsx?$": "@swc/jest" },
  moduleNameMapper: {
    "^@src/(.*)": "<rootDir>/src/$1",
    "^src/(.*)": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  testEnvironment: "node",
  resetMocks: true,
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../artifacts",
        outputName: `junit-orm-${process.env.PLUGINS ?? "stock"}.xml`,
        usePathForSuiteName: "true",
      },
    ],
  ],
};
