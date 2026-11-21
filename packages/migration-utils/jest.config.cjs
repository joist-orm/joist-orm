module.exports = {
  transform: { "^.+\\.[tj]sx?$": "@swc/jest" },
  // node-pg-migrate is ESM-only
  transformIgnorePatterns: ["/node_modules/(?!node-pg-migrate/)"],
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  testEnvironment: "node",
};
