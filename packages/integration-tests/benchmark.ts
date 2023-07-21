import { Benchmark } from "kelonio";
import { knex as createKnex } from "knex";
import postgres from "postgres";

// Run with `yarn tsx ./benchmark.ts` or `bun ./benchmark.ts`

const knex = createKnex({
  client: "pg",
  connection: "postgres://joist:local@localhost:5435/joist",
  debug: false,
  asyncStackTraces: false,
  pool: { max: 4 },
});

const sql = postgres("postgres://joist:local@localhost:5435/joist", { max: 4 });

async function main() {
  await knex.raw("select flush_database()");

  const benchmark = new Benchmark();
  const numberOfEntities = 2000;
  const iterations = 100;

  // Running with serial=false gives particularly bad results for the "individual" tests b/c each
  // iteration has more statements than the number of max connections in the pool, and all iterations
  // are kicked off immediately. This means the first author of each 100 iterations is inserted before
  // the 1st iteration can more on to its 2nd author.
  const serial = false;

  console.log({ numberOfEntities, iterations, serial });

  await benchmark.record(
    `Knex ${numberOfEntities} Authors individually`,
    async () => {
      await knex.transaction(async (knex) => {
        for (const i of zeroTo(numberOfEntities)) {
          await knex.raw(`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (?, ?, ?)`, [
            `a${i}`,
            "a",
            0,
          ]);
        }
      });
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Knex ${numberOfEntities} Authors with VALUES`,
    async () => {
      await knex.transaction(async (knex) => {
        await knex.raw(
          `INSERT INTO "authors" (first_name, initials, number_of_books) VALUES ${zeroTo(numberOfEntities)
            .map(() => `(?, ?, ?)`)
            .join(", ")}`,
          zeroTo(numberOfEntities).flatMap((i) => [`a${i}`, "a", 0]),
        );
      });
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors individually`,
    async () => {
      await sql.begin(async (sql) => {
        for (const i of zeroTo(numberOfEntities)) {
          await sql`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (${`a${i}`}, ${"a"}, ${0})`;
        }
      });
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
      await sql.begin(async (sql) => {
        await sql`INSERT INTO "authors" ${sql(
          zeroTo(numberOfEntities).map((i) => ({ first_name: `a${i}`, initials: "a", number_of_books: 0 })),
        )}`;
      });
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Knex ${numberOfEntities} Authors & ${numberOfEntities} Books with VALUES in txn`,
    async () => {
      await knex.transaction(async (knex) => {
        await Promise.all([
          knex.raw(
            `INSERT INTO "authors" (first_name, initials, number_of_books) VALUES ${zeroTo(numberOfEntities)
              .map(() => `(?, ?, ?)`)
              .join(", ")}`,
            zeroTo(numberOfEntities).flatMap((i) => [`a${i}`, "a", 0]),
          ),
          knex.raw(
            `INSERT INTO "books" (title, author_id) VALUES ${zeroTo(numberOfEntities)
              .map(() => `(?, ?)`)
              .join(", ")}`,
            zeroTo(numberOfEntities).flatMap((i) => [`b${i}`, 1]),
          ),
        ]);
      });
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Knex ${numberOfEntities} Authors & ${numberOfEntities} Books with VALUES no txn`,
    async () => {
      await Promise.all([
        knex.raw(
          `INSERT INTO "authors" (first_name, initials, number_of_books) VALUES ${zeroTo(numberOfEntities)
            .map(() => `(?, ?, ?)`)
            .join(", ")}`,
          zeroTo(numberOfEntities).flatMap((i) => [`a${i}`, "a", 0]),
        ),
        knex.raw(
          `INSERT INTO "books" (title, author_id) VALUES ${zeroTo(numberOfEntities)
            .map(() => `(?, ?)`)
            .join(", ")}`,
          zeroTo(numberOfEntities).flatMap((i) => [`b${i}`, 1]),
        ),
      ]);
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors & ${numberOfEntities} Books with VALUES in txn`,
    async () => {
      await sql.begin(async (sql) => {
        await Promise.all([
          sql`INSERT INTO "authors" ${sql(
            zeroTo(numberOfEntities).map((i) => ({ first_name: `a${i}`, initials: "a", number_of_books: 0 })),
          )}`,
          sql`INSERT INTO "books" ${sql(zeroTo(numberOfEntities).map((i) => ({ title: `b${i}`, author_id: 1 })))}`,
        ]);
      });
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors & ${numberOfEntities} Books with VALUES no txn`,
    async () => {
      await Promise.all([
        sql`INSERT INTO "authors" ${sql(
          zeroTo(numberOfEntities).map((i) => ({ first_name: `a${i}`, initials: "a", number_of_books: 0 })),
        )}`,
        sql`INSERT INTO "books" ${sql(zeroTo(numberOfEntities).map((i) => ({ title: `b${i}`, author_id: 1 })))}`,
      ]);
    },
    { iterations, serial },
  );

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors & Books ${numberOfEntities} individual but pipelined in txn`,
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

  await benchmark.record(
    `Postgres.js ${numberOfEntities} Authors & Books ${numberOfEntities} individual but pipelined in order in txn`,
    async () => {
      await sql.begin((sql) => {
        return [
          ...zeroTo(numberOfEntities).map((i) => {
            return sql`INSERT INTO "authors" (first_name, initials, number_of_books) VALUES (${`a${i}`}, ${"a"}, ${0})`;
          }),
          ...zeroTo(numberOfEntities).map((i) => {
            return sql`INSERT INTO "books" (title, author_id) VALUES (${`b${i}`}, ${1})`;
          }),
        ];
      });
    },
    { iterations, serial },
  );

  console.log(benchmark.report());

  await knex.destroy();
  await sql.end();
}

main().catch((err) => console.log(err));

function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}
