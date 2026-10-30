import { EntityManager, newPgConnectionConfig } from "joist-orm";
import { PostgreJsDriver } from "joist-orm/postgrejs";
import { BindParam, Pool } from "postgrejs";
import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { knex, newEntityManager } from "src/testEm";

describe("PostgreJsDriver", () => {
  let pool: Pool;

  beforeAll(() => {
    const { ssl, ...config } = newPgConnectionConfig();
    pool = new Pool({ ...config, ssl: ssl ? {} : undefined, requireSSL: !!ssl, timezone: "UTC" });
  });

  afterAll(async () => {
    await pool.close();
  });

  it("hydrates paginated finds with the same public entity values as lazy loads", async () => {
    // Given an author with exact bigint, bytea and native array values
    await insertAuthor({
      first_name: "Native",
      number_of_atoms: "9007199254740993",
      certificate: Buffer.from([0, 128, 255]),
      nick_names: ["N"],
    });
    // And separate identity maps keep both hydration paths independent
    const paginated = new EntityManager({}, { driver: new PostgreJsDriver(pool) });
    const lazy = new EntityManager({}, { driver: new PostgreJsDriver(pool) });

    // When a paginated find and a lazy load retrieve the same author
    const [pagedAuthor] = await paginated.find(Author, { id: "a:1" }, { limit: 1 });
    const lazyAuthor = await lazy.load(Author, "a:1");

    // Then the paginated author exposes the same domain values
    expect(pagedAuthor).toMatchEntity({
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

  it("persists only the selected bytes of an author's certificate", async () => {
    // Given a certificate backed by a larger byte array
    const bytes = new Uint8Array([42, 0, 128, 255, 43]).subarray(1, 4);
    const ctx = { ...newEntityManager().ctx };
    const em = new EntityManager(ctx, { driver: new PostgreJsDriver(pool) });
    Object.assign(ctx, { em });
    const author = em.create(Author, { firstName: "Certificate", certificate: bytes });
    // When the certificate is flushed and loaded through a new identity map
    await em.flush();
    const reloaded = await new EntityManager({}, { driver: new PostgreJsDriver(pool) }).load(Author, author.id);
    // Then bytes outside the certificate view were not persisted
    expect(Array.from(reloaded.certificate!)).toEqual([0, 128, 255]);
  });

  it("accepts explicit bytea parameters without Buffer methods", async () => {
    // Given a typed byte view with a nonzero offset
    const bytes = new Uint8Array([42, 0, 128, 255, 43]).subarray(1, 4);
    const driver = new PostgreJsDriver(pool);
    const em = new EntityManager({}, { driver });
    // When an explicit bytea binding is sent through the public query boundary
    const result = await driver.executeQuery(em, "select encode(?::bytea, 'hex') as value", [new BindParam(17, bytes)]);
    // Then the binding preserves exactly the selected bytes
    expect(result.rows).toEqual([{ value: "0080ff" }]);
  });

  it("keeps an uncached rename ahead of a cached rename in one transaction", async () => {
    // Given an author and a transaction with the second rename already prepared
    await insertAuthor({ first_name: "Before" });
    const driver = new PostgreJsDriver(pool);
    const em = new EntityManager({}, { driver });
    const cached = "update authors set first_name = ? where id = 1 /* cached rename */";
    const name = await driver.transaction(em, async () => {
      await driver.executeQuery(em, cached, ["Warm"]);
      // When an uncached rename and the cached rename are submitted concurrently
      await Promise.all([
        driver.executeQuery(em, "update authors set first_name = ? where id = 1 /* cold rename */", ["First"]),
        driver.executeQuery(em, cached, ["Last"]),
      ]);
      return (await em.load(Author, "a:1")).firstName;
    });
    // Then the final name belongs to the last submitted rename
    expect(name).toEqual("Last");
  });
});
