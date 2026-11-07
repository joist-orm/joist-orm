import { Author, newAuthor } from "src/entities";
import { select } from "src/entities/inserts";
import { Stepper } from "src/Stepper.test";
import { knex, newEntityManager } from "src/testEm";

describe("EntityManager.txns", () => {
  it("reproduces anomalies w/o transactions", async () => {
    // Given two writers independently look for the same Publisher
    const steps = new Stepper();
    const t1 = (async () => {
      await steps.on(1, () => knex.select("*").from("publishers").where({ name: "foo" }));
      await steps.on(3, () =>
        knex.insert({ name: "foo", base_sync_default: "foo", base_async_default: "foo" }).into("publishers"),
      );
    })();
    const t2 = (async () => {
      await steps.on(2, () => knex.select("*").from("publishers").where({ name: "foo" }));
      await steps.on(4, () =>
        knex.insert({ name: "foo", base_sync_default: "foo", base_async_default: "foo" }).into("publishers"),
      );
    })();

    // When both writers insert after observing no existing Publisher
    await Promise.all([t1, t2]);

    // Then the database contains both Publishers
    expect(await select("publishers")).toMatchObject([
      { id: 1, name: "foo" },
      { id: 2, name: "foo" },
    ]);
  });

  it("commits pending Authors when a transaction callback returns", async () => {
    // Given an EntityManager with no persisted Authors
    const em = newEntityManager();

    // When the callback creates an Author without explicitly flushing it
    await em.transaction(async () => {
      newAuthor(em, { firstName: "Committed" });
    });

    // Then a separate EntityManager can see the committed Author
    expect(await newEntityManager().find(Author, {})).toMatchEntity([{ firstName: "Committed" }]);
  });

  it("rolls back flushed Author changes when a callback throws", async () => {
    // Given a persisted Author
    const em = newEntityManager();
    const author = newAuthor(em, { firstName: "Original" });
    await em.flush();

    // When a callback flushes a changed name and then fails
    const transaction = em.transaction(async () => {
      author.firstName = "Rolled back";
      await em.flush();
      throw new Error("Callback failed");
    });

    // Then the callback failure reaches the caller
    await expect(transaction).rejects.toThrow("Callback failed");

    // When the Author is loaded in a separate EntityManager
    const persisted = await newEntityManager().load(Author, author.id);

    // Then its flushed change was rolled back
    expect(persisted.firstName).toBe("Original");
  });
});
