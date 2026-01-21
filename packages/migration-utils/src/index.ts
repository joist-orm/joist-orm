import { newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";
import { runMigrationsIfNeeded } from "./migrate";

export * from "./migrate";
export * from "./utils";

export async function joistMigrate(): Promise<void> {
  const client = new Client(newPgConnectionConfig());
  await client.connect();
  try {
    await runMigrationsIfNeeded(client, "./migrations");
  } finally {
    await client.end();
  }
}

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
