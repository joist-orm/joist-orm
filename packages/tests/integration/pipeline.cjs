const postgres = require("postgres");

async function testPipelining() {
  const sql = postgres("postgres://joist:local@localhost:5435/joist", {
    onnotice(n) {
      if (n.severity !== "NOTICE") {
        console.error(n);
      }
    },
  });

  await sql`TRUNCATE tags CASCADE`;

  // Number of statements (i.e. INSERT author, UPDATE book, etc)
  const numStatements = 20;

  // Sequential execution (no pipelining, just serially on 1 connection) ==> 3-5ms
  console.time("sequential");
  await sql.begin(async (sql) => {
    for (let i = 0; i < numStatements; i++) {
      await sql`INSERT INTO tags (name) VALUES (${`value-${i}`})`;
    }
  });
  console.timeEnd("sequential");

  // "Concurrent" execution with Promise.all  ==> 15ms
  // This is expensive b/c each statement is waiting on the connection pool
  console.time("concurrent");
  const promises = [];
  for (let i = 0; i < numStatements; i++) {
    promises.push(sql`INSERT INTO tags (name) VALUES (${`value-${i + numStatements}`})`);
  }
  await Promise.all(promises);
  console.timeEnd("concurrent");

  // Now use sql.begin so we have a reserved connection => can pipeline
  console.time("pipeline (return string[])"); // ==> 1m
  await sql.begin((sql) => {
    const statements = [];
    for (let i = 0; i < numStatements; i++) {
      statements.push(sql`INSERT INTO tags (name) VALUES (${`value-${i + numStatements}`})`);
    }
    return statements;
  });
  console.timeEnd("pipeline (return string[])");

  // Also with sql.begin so we have a reserved connection => can pipeline ==> < 1ms
  console.time("pipeline (await Promise.all)");
  await sql.begin(async (sql) => {
    const statements = [];
    for (let i = 0; i < numStatements; i++) {
      statements.push(sql`INSERT INTO tags (name) VALUES (${`value-${i + numStatements}`})`);
    }
    await Promise.all(statements);
  });
  console.timeEnd("pipeline (await Promise.all)");

  await sql.end();
}

testPipelining().catch(console.error);
