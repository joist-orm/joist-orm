/** @type {import('jest').Config} */
module.exports = {
  transform: {
    "^.+\\.tsx?$": "@swc/jest",
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  testEnvironment: "node",
};
