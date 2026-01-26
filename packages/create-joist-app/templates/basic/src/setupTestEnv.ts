export default async function globalSetup(): Promise<void> {
  // Verify database connection before running tests
  const { newPgConnectionConfig } = await import("joist-orm/pg");
  const knex = (await import("knex")).default;
  const config = newPgConnectionConfig();
  const db = knex({ client: "pg", connection: config });

  try {
    await db.raw("SELECT 1");
    console.log("Database connection verified");
  } catch (error) {
    console.error("Failed to connect to database. Make sure to run 'yarn db' first.");
    throw error;
  } finally {
    await db.destroy();
  }
}
