module.exports = {
  ...require("./jest.config.js"),
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        astTransformers: { before: [{ path: "joist-transform-properties", options: { type: "raw" } }] },
        tsconfig: { moduleResolution: "classic" },
      },
    ],
  },
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../../../artifacts",
        outputName: `junit-tests-integration-transformed.xml`,
        usePathForSuiteName: "true",
      },
    ],
  ],
};
