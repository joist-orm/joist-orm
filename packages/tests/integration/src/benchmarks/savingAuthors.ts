import { PostgresDriver } from "joist-orm";
import { newPgConnectionConfig } from "joist-utils";
import postgres from "postgres";
import { Context } from "src/context";
import { Author, EntityManager } from "src/entities";

const sql = postgres(newPgConnectionConfig());
const driver = new PostgresDriver(sql);
const makeApiCall: any = () => {};

async function main() {
  const mitata = await import("mitata");
  const { run, bench, group } = mitata;

  group("integration-knex", () => {
    bench("saving 1 author", async () => {
      const em = new EntityManager({ makeApiCall } as Context, { driver });
      const a = em.create(Author, { firstName: "a" });
      await em.flush();
    });

    bench("saving 20 authors", async () => {
      const em = new EntityManager({ makeApiCall } as Context, { driver });
      for (let i = 0; i < 20; i++) {
        const a = em.create(Author, { firstName: `a${i}` });
      }
      await em.flush();
    });
  });

  await run({});
  await sql.end();
}

// yarn clinic flame -- node --env-file .env --import=tsx ./src/benchmarks/loading-authors.ts
// yarn env-cmd tsx ./src/benchmarks/loading-authors.ts
// bun src/saving-authors.ts
main();
