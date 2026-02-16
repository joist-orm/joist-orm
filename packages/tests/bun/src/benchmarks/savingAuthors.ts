import { PostgresDriver } from "joist-orm/pg";
import { newPgConnectionConfig } from "joist-utils";
import pg from "pg";
import { Author, EntityManager } from "src/entities";
import type { Context } from "../context";

const pool = new pg.Pool(newPgConnectionConfig());
const driver = new PostgresDriver(pool);

async function main() {
  const mitata = await import("mitata");
  const { run, bench, group } = mitata;

  group("bun-pg", () => {
    bench("saving 1 author", async () => {
      const em = new EntityManager({} as Context, { driver });
      const a = em.create(Author, { firstName: "a" });
      await em.flush();
    });

    bench("saving 20 authors", async () => {
      const em = new EntityManager({} as Context, { driver });
      for (let i = 0; i < 20; i++) {
        const a = em.create(Author, { firstName: `a${i}` });
      }
      await em.flush();
    });
  });

  await run({});
  await pool.end();
}

// yarn clinic flame -- node --env-file .env --import=tsx ./src/benchmarks/loading-authors.ts
// yarn env-cmd tsx ./src/benchmarks/loading-authors.ts
// bun src/saving-authors.ts
main();
