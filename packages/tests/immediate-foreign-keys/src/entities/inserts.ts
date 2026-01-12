import { sql } from "@src/setupDbTests";

// Note this test infrastructure exist solely to test Joist itself, i.e. to use
// the low-level driver infra to setup/assert against data. Downstream applications
// should not copy this approach, and instead just use the factories and entities to
// setup and assert against test data.

// Only meant for testing Joist's internals; in real apps use factories instead.
export async function insertAuthor(row: { first_name: string; last_name?: string | null }) {
  await sql`INSERT INTO authors ${sql(
    { created_at: new Date(), updated_at: new Date(), ...row },
    ...(["created_at", "updated_at", ...Object.keys(row)] as any[]),
  )}`;
}
