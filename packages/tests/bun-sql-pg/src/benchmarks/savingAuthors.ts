import { SQL } from "bun";
import { BunPgDriver } from "joist-driver-bun-pg";
import { Author, EntityManager } from "src/entities";
import { Context } from "../context.ts";

const sql = new SQL();
const driver = new BunPgDriver(sql);

async function main() {
  const mitata = await import("mitata");
  const { run, bench, group } = mitata;

  group("bun-sql", () => {
    bench("saving 1 author", async () => {
      const em = new EntityManager({} as Context, { driver });
      em.create(Author, { firstName: "a" });
      await em.flush();
    });

    bench("saving 20 authors", async () => {
      const em = new EntityManager({} as Context, { driver });
      for (let i = 0; i < 20; i++) {
        em.create(Author, { firstName: `a${i}` });
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
