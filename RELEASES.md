# Releases

Joist uses two long-lived release channels:

- `main` is the rolling `next` channel. Every merge to `main` can publish a prerelease tagged as `next` in npm.
- `release` is the stable channel. Stable semver releases are cut by periodically merging `main` into `release`.

This keeps day-to-day development simple while still giving stable releases an explicit promotion point.

## Branch Roles

- `main`
  - Ongoing development happens here.
  - Releases from this branch are prereleases, e.g. `2.3.0-next.14`.
  - These versions are intended for early adopters and internal consumers that want changes immediately.
- `release`
  - This branch only moves when we intentionally promote a set of `main` changes to stable.
  - Releases from this branch are normal semver releases, e.g. `3.0.0` or `3.1.2`.
  - Prefer merge commits from `main`; do not squash the release history.

## Recommended Stable Release Procedure

When `main` has accumulated enough changes for a stable release:

1. Make sure `main` is in the state you want to ship.
2. Create a merge change that brings `main` into `release`.
3. Keep the merge as a real merge commit so the stable release records exactly which line of development was promoted.
4. Let CI publish from `release`.
5. Continue normal development on `main`.

In `jj`, the merge itself can be as simple as creating a change with both `release` and `main` as parents, for example:

```bash
jj new release main
```

Then describe that merge change as the stable release promotion and land it onto `release`.

To draft the merge description from the commits that are in `main` but not yet in `release`, run:

```bash
./scripts/release-message.sh
```

It defaults to `main -> release`, prints a merge title, and then includes every one-line commit subject from `release..main`.

## Merge Commit Message

The merge commit message should make the promotion obvious. A good default shape is:

```text
release: promote main to stable

Includes since the last stable release:
- fix relation loading for async derived fields
- add dual release channel docs
- change codegen defaults for tagged ids
```

`./scripts/release-message.sh` generates this shape automatically using the one-line descriptions from the commits being promoted.

The generated bullet list is intentionally exhaustive. If the release is large, you can edit the output down to a shorter curated summary before landing the merge.

Good sources for this summary are:

- the commits reachable from `main` but not yet in `release`
- the semantic-release generated notes draft
- the changelog entries or release announcement notes

## Why We Use Merge Commits

- The stable release has a clear promotion point.
- The full `main` history stays intact.
- We avoid a single squash commit that hides how the release was built.
- `main` can continue immediately after the release without creating a new long-lived branch.

## After the Release

Do not create a new `main` branch after each stable release.

- Keep developing on `main`.
- Periodically merge `main` into `release` again for the next stable cut.
- If a hotfix must land directly on `release`, make sure that change is also merged back into `main` so the branches do not drift.

## Practical Notes

- Treat `release` as a promotion branch, not the main development branch.
- Avoid direct commits to `release` unless handling an urgent stable-only fix.
- If a release needs dedicated notes, put them in the merge commit message, the generated changelog, or both.
