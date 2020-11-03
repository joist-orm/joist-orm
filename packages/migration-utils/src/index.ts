import { runMigrationsIfNeeded } from "./migrate";

export * from "./migrate";
export * from "./utils";

// If we're being run locally.
if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  runMigrationsIfNeeded("./migrations").catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
