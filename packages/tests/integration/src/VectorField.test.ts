import { ParentGroup } from "src/entities";
import { insertParentGroup, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("VectorField", () => {
  it("is excluded from the default SELECT and lazy loads as a number[]", async () => {
    await insertParentGroup({ name: "pg1", embedding: "[0.1,0.2,0.3]" });
    const em = newEntityManager();
    resetQueryCount();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    expect(await pg.embedding.load()).toEqual([0.1, 0.2, 0.3]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT pg.id, pg.name, pg.created_at, pg.updated_at, pg.eager_embedding FROM parent_groups AS pg WHERE pg.id = ANY($1) ORDER BY pg.id ASC LIMIT $2",
       "SELECT pg.id as id, pg.embedding FROM parent_groups AS pg WHERE pg.id = ANY($1) LIMIT $2",
     ]
    `);
  });

  it("can set, flush, and reload in a fresh em", async () => {
    const em = newEntityManager();
    em.create(ParentGroup, { name: "pg1", requiredData: {}, embedding: [0.1, -2.5, 3] });
    resetQueryCount();
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "select nextval('parent_groups_id_seq') from generate_series(1, 1)",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::text[]) as name, unnest($3::jsonb[]) as bulk_data, unnest($4::jsonb[]) as required_data, unnest($5::timestamp with time zone[]) as created_at, unnest($6::timestamp with time zone[]) as updated_at, unnest($7::vector[]) as embedding, unnest($8::vector[]) as eager_embedding) INSERT INTO parent_groups (id, name, bulk_data, required_data, created_at, updated_at, embedding, eager_embedding) SELECT * FROM data",
       "COMMIT;",
     ]
    `);
    // Stored as pgvector's own literal, not a pg array literal
    expect(await select("parent_groups")).toMatchObject([{ embedding: "[0.1,-2.5,3]" }]);
    const em2 = newEntityManager();
    const pg = await em2.load(ParentGroup, "parentGroup:1", "embedding");
    expect(pg.embedding.get).toEqual([0.1, -2.5, 3]);
  });

  it("can blind-set an unloaded vector with a targeted UPDATE", async () => {
    await insertParentGroup({ name: "pg1", embedding: "[1,2,3]" });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    pg.embedding.set([4, 5, 6]);
    resetQueryCount();
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::timestamp with time zone[]) as updated_at, unnest($3::timestamptz[]) as __original_updated_at) UPDATE parent_groups SET updated_at = data.updated_at FROM data WHERE parent_groups.id = data.id AND date_trunc('milliseconds', parent_groups.updated_at) = data.__original_updated_at RETURNING parent_groups.id",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::vector[]) as embedding) UPDATE parent_groups SET embedding = data.embedding FROM data WHERE parent_groups.id = data.id RETURNING parent_groups.id",
       "COMMIT;",
     ]
    `);
    const em2 = newEntityManager();
    const pg2 = await em2.load(ParentGroup, "parentGroup:1", "embedding");
    expect(pg2.embedding.get).toEqual([4, 5, 6]);
  });

  it("reads a non-lazy vector in the default SELECT", async () => {
    await insertParentGroup({ name: "pg1", eager_embedding: "[0.1,-2.5,3]" });
    const em = newEntityManager();
    resetQueryCount();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    expect(pg).toMatchEntity({ eagerEmbedding: [0.1, -2.5, 3] });
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT pg.id, pg.name, pg.created_at, pg.updated_at, pg.eager_embedding FROM parent_groups AS pg WHERE pg.id = ANY($1) ORDER BY pg.id ASC LIMIT $2",
     ]
    `);
  });

  it("can set and flush a non-lazy vector", async () => {
    await insertParentGroup({ name: "pg1", eager_embedding: "[1,2,3]" });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    pg.eagerEmbedding = [4, 5, 6];
    resetQueryCount();
    await em.flush();
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::timestamp with time zone[]) as updated_at, unnest($3::vector[]) as eager_embedding, unnest($4::timestamptz[]) as __original_updated_at) UPDATE parent_groups SET updated_at = data.updated_at, eager_embedding = data.eager_embedding FROM data WHERE parent_groups.id = data.id AND date_trunc('milliseconds', parent_groups.updated_at) = data.__original_updated_at RETURNING parent_groups.id",
       "COMMIT;",
     ]
    `);
    expect(await select("parent_groups")).toMatchObject([{ eager_embedding: "[4,5,6]" }]);
    const em2 = newEntityManager();
    expect(await em2.load(ParentGroup, "parentGroup:1")).toMatchEntity({ eagerEmbedding: [4, 5, 6] });
  });
});
