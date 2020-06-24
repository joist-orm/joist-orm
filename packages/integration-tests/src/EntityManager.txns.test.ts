import { Publisher } from "@src/entities";
import { Stepper } from "@src/Stepper.test";
import { EntityManager, newPgConnectionConfig } from "joist-orm";
import { Pool } from "pg";
import { knex } from "./setupDbTests";

describe("EntityManager", () => {
  it("reproduces anomalies w/o transactions", async () => {
    const steps = new Stepper();

    const t1 = (async () => {
      await steps.on(1, () => knex.select("*").from("publishers").where({ name: "foo" }));
      await steps.on(3, () => knex.insert({ name: "foo" }).into("publishers"));
    })();

    const t2 = (async () => {
      await steps.on(2, () => knex.select("*").from("publishers").where({ name: "foo" }));
      await steps.on(4, () => knex.insert({ name: "foo" }).into("publishers"));
    })();

    await Promise.all([t1, t2]);
    const rows = await knex.select("*").from("publishers");
    expect(rows).toMatchObject([
      { id: 1, name: "foo" },
      { id: 2, name: "foo" },
    ]);
  });

  it("using regular isolation level does not avoid anomalies", async () => {
    const steps = new Stepper();

    const t1 = (async () => {
      // Use the default transaction isolation level
      await knex.transaction(async (knex) => {
        await steps.on(1, () => knex.select("*").from("publishers").where({ name: "foo" }));
        await steps.on(3, () => knex.insert({ name: "foo" }).into("publishers"));
      });
    })();

    const t2 = (async () => {
      await knex.transaction(async (knex) => {
        await steps.on(2, () => knex.select("*").from("publishers").where({ name: "foo" }));
        await steps.on(4, () => knex.insert({ name: "foo" }).into("publishers"));
      });
    })();

    // We still get two rows
    await Promise.all([t1, t2]);
    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(2);
  });

  it("using serializable avoids anomalies", async () => {
    const steps = new Stepper();

    const t1 = (async () => {
      const txn = await knex.transaction();
      await txn.raw("set transaction isolation level serializable;");
      await steps.on(1, () => txn.select("*").from("publishers").where({ name: "foo" }));
      await steps.on(3, async () => {
        await txn.insert({ name: "foo" }).into("publishers");
        await txn.commit();
      });
    })();

    const t2 = (async () => {
      const txn = await knex.transaction();
      try {
        await txn.raw("set transaction isolation level serializable;");
        await steps.on(2, () => txn.select("*").from("publishers").where({ name: "foo" }));
        await steps.on(4, () => txn.insert({ name: "foo" }).into("publishers"));
      } catch (e) {
        await txn.rollback();
        throw e;
      }
    })();

    await t1;
    await expect(t2).rejects.toThrow("could not serialize access");

    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(1);
    expect(rows).toMatchObject([{ id: 1, name: "foo" }]);
  });

  it("using serializable via node-pg avoids anomalies", async () => {
    const steps = new Stepper();

    const pool = new Pool(newPgConnectionConfig());

    const t1 = (async () => {
      const conn = await pool.connect();
      await conn.query("begin");
      await conn.query("set transaction isolation level serializable;");
      await steps.on(1, async () => conn.query("select * from publishers where name = 'foo'"));
      await steps.on(3, async () => {
        await conn.query("insert into publishers (name) values ('foo')");
        await conn.query("commit");
      });
      conn.release();
    })();

    const t2 = (async () => {
      const conn = await pool.connect();
      try {
        await conn.query("begin");
        await conn.query("set transaction isolation level serializable;");
        await steps.on(2, async () => conn.query("select * from publishers where name = 'foo'"));
        await steps.on(4, async () => conn.query("insert into publishers (name) values ('foo')"));
      } finally {
        conn.release();
      }
    })();

    await t1;
    await expect(t2).rejects.toThrow("could not serialize access");
    await pool.end();

    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(1);
    expect(rows).toMatchObject([{ id: 1, name: "foo" }]);
  });

  it("using EntityManager.transaction avoids anomalies", async () => {
    const steps = new Stepper();

    const t1 = (async () => {
      const em = new EntityManager(knex);
      await em.transaction(async () => {
        await steps.on(1, async () => em.find(Publisher, { name: "foo" }));
        await steps.on(3, async () => em.create(Publisher, { name: "foo" }));
      });
      await steps.on(5, async () => {});
    })();

    const t2 = (async () => {
      const em = new EntityManager(knex);
      await em.transaction(async () => {
        await steps.on(2, async () => em.find(Publisher, { name: "foo" }));
        await steps.on(4, async () => em.create(Publisher, { name: "foo" }));
        // noop wait to ensure that step 5 has run, i.e. the t1 has committed
        await steps.on(6, async () => {});
      });
    })();

    await t1;
    await expect(t2).rejects.toThrow("could not serialize access");

    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(1);
    expect(rows).toMatchObject([{ id: 1, name: "foo" }]);
  });
});
