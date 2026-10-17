import { EntityManager, newPgConnectionConfig } from "joist-orm";
import { PostgreJsDriver } from "joist-orm/pg";
import { Pool } from "postgrejs";
import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { knex } from "src/testEm";

describe("PostgreJsDriver", () => {
  let pool: Pool;

  beforeAll(() => {
    const { ssl, ...config } = newPgConnectionConfig();
    pool = new Pool({ ...config, ssl: ssl ? {} : undefined, requireSSL: !!ssl, timezone: "UTC" });
  });

  afterAll(async () => {
    await pool.close();
  });

  it("hydrates eager results with the same public entity values as lazy results", async () => {
    // Given an author with exact bigint, bytea and native array values
    await insertAuthor({
      first_name: "Native",
      number_of_atoms: "9007199254740993",
      certificate: Buffer.from([0, 128, 255]),
      nick_names: ["N"],
    });
    const eager = new EntityManager({}, { driver: new PostgreJsDriver(pool, { lazyRows: false }) });
    const lazy = new EntityManager({}, { driver: new PostgreJsDriver(pool) });

    // When each decoding mode loads the author
    const eagerAuthor = await eager.load(Author, "a:1");
    const lazyAuthor = await lazy.load(Author, "a:1");

    // Then eager hydration exposes the same domain values
    expect(eagerAuthor).toMatchEntity({
      firstName: lazyAuthor.firstName,
      numberOfAtoms: lazyAuthor.numberOfAtoms,
      certificate: lazyAuthor.certificate,
      nickNames: lazyAuthor.nickNames,
    });
  });

  it("shares uncommitted native writes with ORM reads", async () => {
    // Given an author and a driver with its own native pool
    await insertAuthor({ first_name: "Before" });
    const driver = new PostgreJsDriver(pool);
    const em = new EntityManager({}, { driver });

    // When a native transaction query renames the author before an ORM load
    const name = await driver.transaction(em, async (txn) => {
      await txn.query("update authors set first_name = $1 where id = 1", { params: ["Native transaction"] });
      return (await em.load(Author, "a:1")).firstName;
    });

    // Then the ORM reads the uncommitted value on that same connection
    expect(name).toEqual("Native transaction");
  });

  it("rolls back native writes when the transaction callback fails", async () => {
    // Given an author and a native transaction
    await insertAuthor({ first_name: "Before" });
    const driver = new PostgreJsDriver(pool);
    const em = new EntityManager({}, { driver });
    const failure = new Error("abort rename");

    // When a rename is followed by an application failure
    await driver
      .transaction(em, async (txn) => {
        await txn.query("update authors set first_name = $1 where id = 1", { params: ["Rolled back"] });
        throw failure;
      })
      .catch((error) => {
        if (error !== failure) throw error;
      });

    // Then the committed author remains unchanged
    expect(await knex.select("first_name").from("authors")).toEqual([{ first_name: "Before" }]);
  });
});
