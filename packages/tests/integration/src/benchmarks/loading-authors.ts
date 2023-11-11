import { Author } from "@src/entities";
import { newEntityManager, testDriver } from "@src/testEm";

async function main() {
  const mitata = await import("mitata");
  const { run, bench, group, baseline } = mitata;

  /*
  SELECT flush_database();
  INSERT INTO authors (first_name, initials, number_of_books) SELECT 'a' || i::text, '', 0 FROM generate_series(1, 50000) AS t(i);
  INSERT INTO books (author_id, title) SELECT i, 'b' || i::text FROM generate_series(1, 50000) AS t(i);
   */

  group("loading one level", () => {
    bench("authors", async () => {
      const em = newEntityManager();
      await em.find(Author, {});
    });
  });

  group("loading two levels", () => {
    bench("authors", async () => {
      const em = newEntityManager();
      await em.find(Author, { id: { lt: 20_000 } } as any, { populate: "books" });
    });
  });

  await run({});
  await testDriver.destroy();
}

// yarn env-cmd tsx ./src/benchmarks/loading-authors.ts
main();
