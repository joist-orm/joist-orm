import { joistMigrate } from "joist-migration-utils";

// Re-export everything from joist-migration-utils
export * from "joist-migration-utils";

// If we're being run locally.
if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  joistMigrate().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
