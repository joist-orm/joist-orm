// PostgreJS is ESM-only; the CommonJS Jest fixtures need its dependency tree transformed too.
module.exports = {
  transform: { "^.+\\.[tj]sx?$": "@swc/jest" },
  transformIgnorePatterns: [
    "/node_modules/(?!(postgrejs|@jsopen/objects|doublylinked|flexy-buffer|lightning-pool|power-tasks|putil-promisify|putil-varhelpers|node-events-async|ts-gems|tslib)/)",
  ],
};
