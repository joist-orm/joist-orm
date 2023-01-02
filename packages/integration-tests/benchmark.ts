import { newPgConnectionConfig } from "joist-utils";
import { Benchmark } from "kelonio";
import { knex as createKnex } from "knex";
import postgres from "postgres";

const knex = createKnex({
  client: "pg",
  connection: newPgConnectionConfig(),
  debug: false,
  asyncStackTraces: false,
  pool: { max: 4 },
});

const sql = postgres("postgres://joist:local@localhost:5435/joist", { max: 4 });

async function main() {
  await knex.raw("select flush_database()");

  const benchmark = new Benchmark();
  const numberOfEntities = 10;
  const iterations = 100;
  const serial = true;

  console.log({ numberOfEntities, iterations, serial });

  await benchmark.record(
    `Knex ${numberOfEntities} Authors individually`,
    async () => {
      for await (const i of zeroTo(numberOfEntities)) {
        await knex.raw(`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (?, ?, ?)`, [
          `a${i}`,
          "a",
          0,
        ]);
      }
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Knex ${numberOfEntities} Authors with VALUES`,
    async () => {
      await knex.raw(
        `INSERT INTO "authors" (first_name, initials, number_of_books) VALUES ${zeroTo(numberOfEntities)
          .map(() => `(?, ?, ?)`)
          .join(", ")}`,
        zeroTo(numberOfEntities).flatMap((i) => [`a${i}`, "a", 0]),
      );
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors individually`,
    async () => {
      for await (const i of zeroTo(numberOfEntities)) {
        await sql`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (${`a${i}`}, ${"a"}, ${0})`;
      }
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors individual but pipelined`,
    async () => {
      await sql.begin((sql) => {
        return zeroTo(numberOfEntities).map((i) => {
          return sql`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (${`a${i}`}, ${"a"}, ${0})`;
        });
      });
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors with VALUES`,
    async () => {
      await sql`INSERT INTO "authors" ${sql(
        zeroTo(numberOfEntities).map((i) => ({ first_name: `a${i}`, initials: "a", number_of_books: 0 })),
      )}`;
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Knex ${numberOfEntities} Authors & ${numberOfEntities} Books with VALUES`,
    async () => {
      await knex.raw(
        `INSERT INTO "authors" (first_name, initials, number_of_books) VALUES ${zeroTo(numberOfEntities)
          .map(() => `(?, ?, ?)`)
          .join(", ")}`,
        zeroTo(numberOfEntities).flatMap((i) => [`a${i}`, "a", 0]),
      );
      await knex.raw(
        `INSERT INTO "books" (title, author_id) VALUES ${zeroTo(numberOfEntities)
          .map(() => `(?, ?)`)
          .join(", ")}`,
        zeroTo(numberOfEntities).flatMap((i) => [`b${i}`, 1]),
      );
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors & ${numberOfEntities} Books with VALUES`,
    async () => {
      await sql`INSERT INTO "authors" ${sql(
        zeroTo(numberOfEntities).map((i) => ({ first_name: `a${i}`, initials: "a", number_of_books: 0 })),
      )}`;
      await sql`INSERT INTO "books" ${sql(zeroTo(numberOfEntities).map((i) => ({ title: `b${i}`, author_id: 1 })))}`;
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors & Books ${numberOfEntities} individual but pipelined`,
    async () => {
      await sql.begin((sql) => {
        return zeroTo(numberOfEntities).flatMap((i) => {
          return [
            sql`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (${`a${i}`}, ${"a"}, ${0})`,
            sql`INSERT INTO "books" (title, author_id) VALUES (${`b${i}`}, ${1})`,
          ];
        });
      });
    },
    { iterations, serial },
  );

  console.log(benchmark.report());

  await knex.destroy();
  await sql.end();
}

main();

function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}
