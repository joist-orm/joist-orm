module.exports = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { pkgRoot: ".", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/codegen", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/graphql-codegen", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/integration-tests", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/migration-utils", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/orm", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/tests/uuid-ids", npmPublish: false }],
    ["@semantic-release/npm", { pkgRoot: "packages/utils", npmPublish: false }],
    ["@semantic-release/exec", { publishCmd: "yarn workspaces foreach --no-private npm publish" }],
    "@semantic-release/github",
    ["@semantic-release/git", { assets: ["CHANGELOG.md", "package.json", "packages/*/package.json"] }],
  ],
};
