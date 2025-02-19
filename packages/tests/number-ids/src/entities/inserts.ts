import { sql } from "src/setupDbTests";

// Only meant for testing Joist's internals; in real apps use factories instead.
export async function insertAuthor(row: { first_name: string; last_name?: string | null }) {
  await sql`INSERT INTO authors ${sql({ created_at: new Date(), updated_at: new Date(), ...row })}`;
}
