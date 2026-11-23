import { saveEntities, saveEntity } from "joist-graphql-resolver-utils";
import { Author } from "src/entities";
import { insertAuthor, select } from "src/entities/inserts";

describe("saveEntity", () => {
  it.withCtx("does not save a batch when an author does not exist", async (ctx) => {
    // Given an author named Alice in the database
    await insertAuthor({ id: 1, first_name: "Alice" });
    // When a batch renames Alice and also tries to rename a missing author
    const save = saveEntities(ctx, Author, [
      { id: "a:1", firstName: "Alicia" },
      { id: "a:999999", firstName: "Bob" },
    ]);
    // Then the save reports the missing author and leaves Alice's name unchanged in the database
    await expect(save).rejects.toThrow("a:999999 was not found");
    expect(await select("authors")).toMatchObject([{ id: 1, first_name: "Alice" }]);
  });

  it.withCtx("does not save an author when the new publisher does not exist", async (ctx) => {
    // Given an author named Alice in the database
    await insertAuthor({ id: 1, first_name: "Alice" });
    // When a save renames Alice and assigns her to a missing publisher
    const save = saveEntity(ctx, Author, { id: "a:1", firstName: "Alicia", publisher: "p:999999" });
    // Then the save reports the missing publisher and leaves Alice's name unchanged in the database
    await expect(save).rejects.toThrow("p:999999 was not found");
    expect(await select("authors")).toMatchObject([{ id: 1, first_name: "Alice" }]);
  });
});
