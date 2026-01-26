#!/bin/bash
set -e

# This script tests the create-joist-app output to verify scaffolded projects work correctly
# Run from the create-joist-app package directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR=$(mktemp -d)
PROJECT_NAME="test-joist-project"
PROJECT_PATH="$TEST_DIR/$PROJECT_NAME"

cleanup() {
  echo "Cleaning up..."
  if [ -d "$TEST_DIR" ]; then
    # Stop docker containers if running
    if [ -f "$PROJECT_PATH/docker-compose.yml" ]; then
      cd "$PROJECT_PATH" && docker compose down -v 2>/dev/null || true
    fi
    rm -rf "$TEST_DIR"
  fi
}

trap cleanup EXIT

echo "================================================"
echo "Testing create-joist-app scaffolding"
echo "================================================"
echo "Test directory: $TEST_DIR"
echo ""

# Build the package first
echo "Building create-joist-app..."
cd "$PACKAGE_DIR"
yarn build

# Create a test project
echo ""
echo "Creating test project..."
mkdir -p "$PROJECT_PATH"

# Run the CLI directly (using the built output)
node "$PACKAGE_DIR/build/index.js" "$PROJECT_PATH" \
  --template basic \
  --use-yarn \
  --yes \
  --db-name test_joist_db \
  --db-user test_joist_user \
  --skip-install

# Verify files were created
echo ""
echo "Verifying project structure..."
for file in "package.json" "tsconfig.json" "joist-config.json" "docker-compose.yml" ".env"; do
  if [ ! -f "$PROJECT_PATH/$file" ]; then
    echo "ERROR: Missing $file"
    exit 1
  fi
  echo "  ✓ $file"
done

# Optional: Full integration test with docker
if [ "$FULL_TEST" = "true" ]; then
  echo ""
  echo "Running full integration test..."

  cd "$PROJECT_PATH"

  # Install dependencies
  echo "Installing dependencies..."
  yarn install

  # Start database
  echo "Starting database..."
  docker compose up -d db

  # Wait for database
  echo "Waiting for database..."
  yarn db-wait

  # Run migrations
  echo "Running migrations..."
  yarn migrate

  # Run codegen
  echo "Running codegen..."
  yarn codegen

  # Build project
  echo "Building project..."
  yarn build

  # Run tests
  echo "Running tests..."
  yarn test

  echo ""
  echo "✓ Full integration test passed!"
fi

echo ""
echo "================================================"
echo "✓ All scaffolding tests passed!"
echo "================================================"
