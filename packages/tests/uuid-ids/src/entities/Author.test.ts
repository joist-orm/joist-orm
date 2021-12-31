import { Author } from "@src/entities/Author";
import { knex, newEntityManager } from "@src/setupDbTests";
import { randomUUID } from "crypto";

describe("Author", () => {
  it("can have business logic methods", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
  });
});

export async function insertAuthor(row: { first_name: string; last_name?: string | null }) {
  await knex.insert({ id: randomUUID(), ...row }).into("authors");
}
