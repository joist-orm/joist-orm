const postgres = require("postgres");
const { run, bench, boxplot, summary } = require("mitata");

// node --expose-gc --import tsx --env-file=.env ./pipeline.cjs

// Number of statements (i.e. INSERT author, UPDATE book, etc)
const numStatements = 30;

const sql = postgres("postgres://joist:local@localhost:5435/joist", {
  onnotice(n) {
    if (n.severity !== "NOTICE") {
      console.error(n);
    }
  },
});

async function testPipelining() {
  // Sequential execution (no pipelining, just serially on 1 connection) ==> 3-5ms
  summary(() => {
    bench("sequential", async () => {
      await sql.begin(async (sql) => {
        for (let i = 0; i < numStatements; i++) {
          await sql`INSERT INTO tags (name) VALUES (${`value-${i}`})`;
        }
      });
    });

    // "Concurrent" execution with Promise.all  ==> 15ms
    // This is expensive b/c each statement is waiting on the connection pool
    bench("concurrent", async () => {
      const promises = [];
      for (let i = 0; i < numStatements; i++) {
        promises.push(sql`INSERT INTO tags (name)VALUES (${`value-${i + numStatements}`})`);
      }
      await Promise.all(promises);
    });

    // Now use sql.begin so we have a reserved connection => can pipeline
    bench("pipeline (return string[])", async () => {
      await sql.begin((sql) => {
        const statements = [];
        for (let i = 0; i < numStatements; i++) {
          statements.push(sql`INSERT INTO tags (name) VALUES (${`value-${i + numStatements}`})`);
        }
        return statements;
      });
    });

    // Also with sql.begin so we have a reserved connection => can pipeline ==> < 1ms
    bench("pipeline (await Promise.all)", async () => {
      await sql.begin(async (sql) => {
        const statements = [];
        for (let i = 0; i < numStatements; i++) {
          statements.push(sql`INSERT INTO tags (name) VALUES (${`value-${i + numStatements}`})`);
        }
        await Promise.all(statements);
      });
    });
  });

  await sql`TRUNCATE tags CASCADE`;
  await run();
  await sql.end();
}

testPipelining().catch(console.error);
