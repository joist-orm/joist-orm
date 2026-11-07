import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("EntityManager.errors / PostgreSQL", () => {
  it("includes the pg DETAIL in raw constraint failures", async () => {
    // Given an Author already owns a unique SSN
    await insertAuthor({ first_name: "a1", ssn: "123" });
    // And a new Author tries to use the same SSN
    const em = newEntityManager();
    em.create(Author, { firstName: "a2", ssn: "123" });

    // When the duplicate Author is persisted
    // Then the native PostgreSQL constraint detail remains available for debugging
    await expect(em.flush()).rejects.toMatchObject({
      message: `duplicate key value violates unique constraint "authors_ssn_key" — Key (ssn)=(123) already exists.`,
    });
  });
});
