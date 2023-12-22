import { Author } from "@src/entities";
import { knex, newEntityManager, testDriver } from "@src/testEm";
import postgres from "postgres";

async function main() {
  const mitata = await import("mitata");
  const { run, bench, group, baseline } = mitata;

  const sql = postgres("postgres://joist:local@localhost:5435/joist", { max: 4 });

  /*
  SELECT flush_database();
  INSERT INTO authors (first_name, initials, number_of_books) SELECT 'a' || i::text, '', 0 FROM generate_series(1, 50000) AS t(i);
  INSERT INTO books (author_id, title) SELECT i, 'b' || i::text FROM generate_series(1, 50000) AS t(i);
   */

  // group("loading knex", () => {
  //   bench("authors", async () => {
  //     await knex.select("*").from("authors");
  //   });
  // });

  group("loading 50k authors", () => {
    // bench("postgres.js", async () => {
    //   await sql`select * from authors`;
    // });
    //
    // bench("knex", async () => {
    //   await knex.select("*").from("authors");
    // });

    bench("em.find", async () => {
      const em = newEntityManager();
      await em.find(Author, {});
    });
  });

  // group("loading two levels", () => {
  //   bench("authors", async () => {
  //     const em = newEntityManager();
  //     await em.find(Author, { id: { lt: 20_000 } } as any, { populate: "books" });
  //   });
  // });

  await run({});
  await testDriver.destroy();
  await sql.end();
}

// yarn clinic flame -- node --env-file .env --import=tsx ./src/benchmarks/loading-authors.ts
// yarn env-cmd tsx ./src/benchmarks/loading-authors.ts
main();
