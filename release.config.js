module.exports = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    [
      "@semantic-release/exec",
      {
        prepareCmd: "./set-version.sh ${nextRelease.version}",
        publishCmd: "yarn workspaces foreach --all --no-private npm publish",
      },
    ],
    "@semantic-release/github",
    [
      "@semantic-release/git",
      { assets: ["CHANGELOG.md", "package.json", "packages/*/package.json", "packages/*/plugins/package.json"] },
    ],
  ],
};
