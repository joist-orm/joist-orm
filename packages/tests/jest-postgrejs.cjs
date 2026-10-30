// PostgreJS and the global Temporal fallback are ESM-only; CommonJS fixtures need them transformed too.
module.exports = {
  transform: { "^.+\\.[tj]sx?$": "@swc/jest" },
  transformIgnorePatterns: [
    "/node_modules/(?!(postgrejs|temporal-polyfill|temporal-utils|@jsopen/objects|doublylinked|flexy-buffer|lightning-pool|power-tasks|putil-promisify|putil-varhelpers|node-events-async|ts-gems|tslib)/)",
  ],
};
