import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { ParsedFindQuery } from "joist-orm";

describe("PostgresDriver.cte", () => {
  it("can execute a ParsedFindQuery with two CTEs", async () => {
    await insertAuthor({ first_name: "a1", age: 40 });
    await insertAuthor({ first_name: "a2", age: 50 });
    await insertAuthor({ first_name: "a3", age: 60 });

    const em = newEntityManager();
    const driver = (em as any).driver;

    const parsed: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [{ join: "primary", alias: "a", table: "authors" }],
      ctes: [
        {
          alias: "cte1",
          columns: [{ columnName: "min_age", dbType: "int" }],
          query: { kind: "raw", sql: "SELECT ?::int as min_age", bindings: [35] },
        },
        {
          alias: "cte2",
          columns: [{ columnName: "max_age", dbType: "int" }],
          query: { kind: "raw", sql: "SELECT ?::int as max_age", bindings: [55] },
        },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "raw",
            aliases: ["a", "cte1", "cte2"],
            condition: "a.age >= (SELECT min_age FROM cte1) AND a.age <= (SELECT max_age FROM cte2)",
            bindings: [],
            pruneable: false,
          },
        ],
      },
      orderBys: [{ alias: "a", column: "id", order: "ASC" }],
    };

    const results = await driver.executeFind(em, parsed, {});
    expect(results).toHaveLength(2);
    expect(results[0].first_name).toBe("a1");
    expect(results[1].first_name).toBe("a2");
  });

  it("can execute a ParsedFindQuery with a CTE using nested ParsedFindQuery", async () => {
    await insertAuthor({ first_name: "a1", age: 40 });
    await insertAuthor({ first_name: "a2", age: 50 });
    await insertAuthor({ first_name: "a3", age: 60 });

    const em = newEntityManager();
    const driver = (em as any).driver;

    const parsed: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [{ join: "primary", alias: "a", table: "authors" }],
      ctes: [
        {
          alias: "min_age_cte",
          columns: [{ columnName: "min_age", dbType: "int" }],
          query: {
            kind: "ast",
            query: {
              selects: ["MIN(a.age) as min_age"],
              tables: [{ join: "primary", alias: "a", table: "authors" }],
              orderBys: [],
            },
          },
        },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "raw",
            aliases: ["a", "min_age_cte"],
            condition: "a.age > (SELECT min_age FROM min_age_cte)",
            bindings: [],
            pruneable: false,
          },
        ],
      },
      orderBys: [{ alias: "a", column: "id", order: "ASC" }],
    };

    const results = await driver.executeFind(em, parsed, {});
    expect(results).toHaveLength(2);
    expect(results[0].first_name).toBe("a2");
    expect(results[1].first_name).toBe("a3");
  });
});
