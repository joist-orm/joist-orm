module.exports = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { pkgRoot: "packages/codegen" }],
    ["@semantic-release/npm", { pkgRoot: "packages/graphql-codegen" }],
    ["@semantic-release/npm", { pkgRoot: "packages/migration-utils" }],
    ["@semantic-release/npm", { pkgRoot: "packages/orm" }],
    ["@semantic-release/npm", { pkgRoot: "packages/utils" }],
    "@semantic-release/github",
    "@semantic-release/git",
  ],
};
