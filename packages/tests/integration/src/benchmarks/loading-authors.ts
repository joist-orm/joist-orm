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

  group("load just authors", () => {
    baseline("baseline", async () => {
      const em = newEntityManager();
      const authors = await em.find(Author, {});
    });
  });

  await run({
    avg: true, // enable/disable avg column (default: true)
    json: false, // enable/disable json output (default: false)
    colors: true, // enable/disable colors (default: true)
    min_max: true, // enable/disable min/max column (default: true)
    collect: false, // enable/disable collecting returned values into an array during the benchmark (default: false)
    percentiles: false, // enable/disable percentiles column (default: true)
  });

  await testDriver.destroy();
}

main();
