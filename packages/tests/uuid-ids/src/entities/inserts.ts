import { knex } from "@src/setupDbTests";

let _nextId = 0;

/**
 * Re-create stable-ish test ids, but for our Joist internal-testing fixtures.
 *
 * (I.e. in tests for real applications, you'd just use the factories, which would
 * use the PostgresDriver's TestUuidAssigner).
 */
function nextId(): string {
  return `20000000-0000-0000-0000-${String(_nextId++).padStart(12, "0")}`;
}

beforeEach(() => (_nextId = 0));

// Only meant for testing Joist's internals; in real apps use factories instead.
export async function insertAuthor(row: { first_name: string; last_name?: string | null }) {
  await knex
    .insert({
      id: nextId(),
      created_at: new Date(),
      updated_at: new Date(),
      ...row,
    })
    .into("authors");
}
