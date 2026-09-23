import { ParentGroup } from "src/entities";
import { insertParentGroup, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("VectorField", () => {
  it("is excluded from the default SELECT and lazy loads as a number[]", async () => {
    // Given a ParentGroup with both a lazy and an eager vector
    await insertParentGroup({ name: "pg1", lazy_embedding: "[0.1,0.2,0.3]", eager_embedding: "[1,2,3]" });
    const em = newEntityManager();
    resetQueryCount();
    // When we load it and then its lazy vector
    const pg = await em.load(ParentGroup, "parentGroup:1");
    const lazyEmbedding = await pg.lazyEmbedding.load();
    // Then the default SELECT included only the eager vector, and the lazy one was a second query
    expect(pg).toMatchEntity({ eagerEmbedding: [1, 2, 3] });
    expect(lazyEmbedding).toEqual([0.1, 0.2, 0.3]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT pg.id, pg.name, pg.created_at, pg.updated_at, pg.eager_embedding FROM parent_groups AS pg WHERE pg.id = ANY($1) ORDER BY pg.id ASC LIMIT $2",
       "SELECT pg.id as id, pg.lazy_embedding FROM parent_groups AS pg WHERE pg.id = ANY($1) LIMIT $2",
     ]
    `);
  });

  it("can set, flush, and reload in a fresh em", async () => {
    // Given a new ParentGroup with a vector
    const em = newEntityManager();
    em.create(ParentGroup, { name: "pg1", requiredData: {}, lazyEmbedding: [0.1, -2.5, 3] });
    resetQueryCount();
    // When we flush it
    await em.flush();
    // Then the INSERT sent it as a vector, not a pg array
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "select nextval('parent_groups_id_seq') from generate_series(1, 1)",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::text[]) as name, unnest($3::jsonb[]) as bulk_data, unnest($4::jsonb[]) as required_data, unnest($5::timestamp with time zone[]) as created_at, unnest($6::timestamp with time zone[]) as updated_at, unnest($7::vector[]) as lazy_embedding, unnest($8::vector[]) as eager_embedding) INSERT INTO parent_groups (id, name, bulk_data, required_data, created_at, updated_at, lazy_embedding, eager_embedding) SELECT * FROM data",
       "COMMIT;",
     ]
    `);
    // And it's stored as pgvector's own literal
    expect(await select("parent_groups")).toMatchObject([{ lazy_embedding: "[0.1,-2.5,3]" }]);
    // And it reads back as the same number[]
    const em2 = newEntityManager();
    const pg = await em2.load(ParentGroup, "parentGroup:1", "lazyEmbedding");
    expect(pg.lazyEmbedding.get).toEqual([0.1, -2.5, 3]);
  });

  it("can blind-set an unloaded vector with a targeted UPDATE", async () => {
    // Given a ParentGroup with an existing vector
    await insertParentGroup({ name: "pg1", lazy_embedding: "[1,2,3]" });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    // When we set the vector without loading it
    pg.lazyEmbedding.set([4, 5, 6]);
    resetQueryCount();
    await em.flush();
    // Then only that column was UPDATEd, in its own statement
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::timestamp with time zone[]) as updated_at, unnest($3::timestamptz[]) as __original_updated_at) UPDATE parent_groups SET updated_at = data.updated_at FROM data WHERE parent_groups.id = data.id AND date_trunc('milliseconds', parent_groups.updated_at) = data.__original_updated_at RETURNING parent_groups.id",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::vector[]) as lazy_embedding) UPDATE parent_groups SET lazy_embedding = data.lazy_embedding FROM data WHERE parent_groups.id = data.id RETURNING parent_groups.id",
       "COMMIT;",
     ]
    `);
    // And the new value persisted
    const em2 = newEntityManager();
    const pg2 = await em2.load(ParentGroup, "parentGroup:1", "lazyEmbedding");
    expect(pg2.lazyEmbedding.get).toEqual([4, 5, 6]);
  });

  it("can set and flush a non-lazy vector", async () => {
    // Given a ParentGroup with an eager vector
    await insertParentGroup({ name: "pg1", eager_embedding: "[1,2,3]" });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    // When we change it and flush
    pg.eagerEmbedding = [4, 5, 6];
    resetQueryCount();
    await em.flush();
    // Then it's UPDATEd alongside the other changed columns
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::timestamp with time zone[]) as updated_at, unnest($3::vector[]) as eager_embedding, unnest($4::timestamptz[]) as __original_updated_at) UPDATE parent_groups SET updated_at = data.updated_at, eager_embedding = data.eager_embedding FROM data WHERE parent_groups.id = data.id AND date_trunc('milliseconds', parent_groups.updated_at) = data.__original_updated_at RETURNING parent_groups.id",
       "COMMIT;",
     ]
    `);
    // And it's stored as pgvector's own literal and reads back as the same number[]
    expect(await select("parent_groups")).toMatchObject([{ eager_embedding: "[4,5,6]" }]);
    const em2 = newEntityManager();
    expect(await em2.load(ParentGroup, "parentGroup:1")).toMatchEntity({ eagerEmbedding: [4, 5, 6] });
  });
});
