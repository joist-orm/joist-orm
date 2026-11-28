import { toJSON } from "joist-orm";

import { Author } from "./entities/entities";
import { knex, newEntityManager } from "./setupDbTests";

describe("Entity.json", () => {
  it("preserves a Temporal birthday in the payload", async () => {
    // Given an author with a persisted calendar date
    await knex.insert({ firstName: "a1", birthday: "2024-02-29" }).into("authors");
    const author = await newEntityManager().load(Author, "a:1");
    // When the birthday is selected
    const payload = await toJSON(author, "birthday");
    // Then the caller receives the original Temporal.PlainDate
    expect(payload.birthday).toBe(author.birthday);
  });
});
