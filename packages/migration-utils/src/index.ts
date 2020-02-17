import { runMigrationsIfNeeded } from "./migrate";

export * from "./migrate";
export * from "./utils";

// If we're being run locally.
if (require.main === module) {
  runMigrationsIfNeeded("./migrations").catch(err => {

    console.error(err);
  });
}
