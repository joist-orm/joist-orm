module.exports = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    [
      "@semantic-release/exec",
      {
        prepareCmd: "yarn workspaces foreach exec npm version --no-git-tag-version ${nextRelease.version}",
        publishCmd: "yarn workspaces foreach --no-private run npm publish",
      },
    ],
    "@semantic-release/github",
    ["@semantic-release/git", { assets: ["CHANGELOG.md", "package.json", "packages/*/package.json"] }],
  ],
};
