module.exports = {
  branches: ["release"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    [
      "@semantic-release/exec",
      {
        prepareCmd: "yarn workspaces foreach -v --all version ${nextRelease.version}",
        publishCmd: "yarn workspaces foreach -v --all --no-private npm publish --tolerate-republish",
      },
    ],
    "@semantic-release/github",
    [
      "@semantic-release/git",
      { assets: ["CHANGELOG.md", "package.json", "packages/*/package.json", "packages/*/plugins/package.json"] },
    ],
  ],
};
