import { sql } from "@src/testEm";

describe("postgresjs", () => {
  it("handles boolean arrays", async () => {
    // inferType incorrectly types `[false]` as boolean, we have a patch:
    // https://github.com/porsager/postgres/pull/1050
    const rows = await sql`SELECT unnest(${[false]}::boolean[])`;
    expect(rows).toEqual([{ unnest: false }]);
  });

  it("handles jsonb arrays ", async () => {
    // Without for our jsonb fix, this is  encoded as an int[][] i.e. `{{"1","2"},{"5"}}`
    // which is a jagged array and Postgres rejects it
    const jsonb = [[1, 2], [5]];
    const rows = await sql`SELECT unnest(${jsonb}::jsonb[])::json`;
    expect(rows).toEqual([{ unnest: [1, 2] }, { unnest: [5] }]);
  });
});
