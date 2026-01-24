#!/bin/bash
set -e

# Publish a next release with version format: {STABLE}-next.{BUILD_NUM}
# This script is intended to run on every merge to main

PACKAGE_NAME="joist-orm"

# Get the current stable version from npm
STABLE=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "0.0.0")
echo "Current stable version: $STABLE"

# Get the current next version from npm (if any)
CURRENT_NEXT=$(npm view "$PACKAGE_NAME" dist-tags.next 2>/dev/null || echo "")
echo "Current next version: $CURRENT_NEXT"

# Calculate the next build number
if [ -z "$CURRENT_NEXT" ]; then
  NEXT_NUM=1
else
  # Extract the stable part from current next version (e.g., "1.2.3" from "1.2.3-next.42")
  CURRENT_NEXT_STABLE=$(echo "$CURRENT_NEXT" | sed 's/-next\.[0-9]*$//')

  if [ "$CURRENT_NEXT_STABLE" = "$STABLE" ]; then
    # Same stable version, increment the build number
    NEXT_NUM=$(echo "$CURRENT_NEXT" | grep -oP 'next\.\K\d+' | awk '{print $1 + 1}')
  else
    # New stable version was released, reset build number
    NEXT_NUM=1
  fi
fi

VERSION="${STABLE}-next.${NEXT_NUM}"
echo "Publishing version: $VERSION"

# Update all package versions
yarn workspaces foreach -v --all version "$VERSION"

# Publish all packages with the 'next' tag
yarn workspaces foreach -v --all --no-private npm publish --tag next --tolerate-republish

echo "Successfully published $VERSION to the 'next' channel"
