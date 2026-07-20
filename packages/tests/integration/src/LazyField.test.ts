import { ParentGroup } from "src/entities";
import { insertParentGroup } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("LazyField", () => {
  it("is excluded from the entity's default SELECT", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const em = newEntityManager();
    resetQueryCount();
    await em.load(ParentGroup, "parentGroup:1");
    // The load lists columns explicitly and omits `bulk_data`
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT pg.id, pg.name, pg.created_at, pg.updated_at FROM parent_groups AS pg WHERE pg.id = ANY($1) ORDER BY pg.id ASC LIMIT $2",
     ]
    `);
  });

  it("throws if get is accessed before being loaded", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    expect(pg.bulkData.isLoaded).toBe(false);
    // `.get` isn't statically available until loaded (like AsyncProperty), so cast to prove it throws
    expect(() => (pg.bulkData as any).get).toThrow("bulkData has not been loaded yet");
  });

  it("can lazy load the column on demand", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    resetQueryCount();
    expect(await pg.bulkData.load()).toEqual({ key: "value" });
    // Which was a single SELECT of just the id + column
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT pg.id as id, pg.bulk_data FROM parent_groups AS pg WHERE pg.id = ANY($1) LIMIT $2",
     ]
    `);
  });

  it("can be populated and then accessed synchronously", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1", "bulkData");
    expect(pg.bulkData.get).toEqual({ key: "value" });
  });

  it("does not re-query once loaded", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "value" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    await pg.bulkData.load();
    resetQueryCount();
    await pg.bulkData.load();
    expect(queries).toEqual([]);
  });

  it("batches lazy loads across multiple entities into one query", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { a: 1 } });
    await insertParentGroup({ name: "pg2", bulk_data: { a: 2 } });
    const em = newEntityManager();
    const [pg1, pg2] = await em.loadAll(ParentGroup, ["parentGroup:1", "parentGroup:2"]);
    resetQueryCount();
    const [d1, d2] = await Promise.all([pg1.bulkData.load(), pg2.bulkData.load()]);
    expect(d1).toEqual({ a: 1 });
    expect(d2).toEqual({ a: 2 });
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT pg.id as id, pg.bulk_data FROM parent_groups AS pg WHERE pg.id = ANY($1) LIMIT $2",
     ]
    `);
  });

  it("is immediately readable on a new entity without loading", async () => {
    const em = newEntityManager();
    const pg = em.create(ParentGroup, { name: "pg1", bulkData: { key: "value" }, requiredData: {} });
    // New entities keep the value in-memory, so there's nothing to lazy-load
    expect(pg.bulkData.isLoaded).toBe(true);
    expect((pg.bulkData as any).get).toEqual({ key: "value" });
  });

  it("can set the lazy column on create and persist it", async () => {
    const em = newEntityManager();
    em.create(ParentGroup, { name: "pg1", bulkData: { key: "value" }, requiredData: {} });
    await em.flush();
    // A fresh load excludes it, but populating makes it available
    const em2 = newEntityManager();
    const pg = await em2.load(ParentGroup, "parentGroup:1", "bulkData");
    expect(pg.bulkData.get).toEqual({ key: "value" });
  });

  it("can update the lazy column and flush it", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "before" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    pg.bulkData.set({ key: "after" });
    await em.flush();

    const em2 = newEntityManager();
    const pg2 = await em2.load(ParentGroup, "parentGroup:1", "bulkData");
    expect(pg2.bulkData.get).toEqual({ key: "after" });
  });

  it("can unset the lazy column without loading it", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "before" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    // The unloaded column also reads as undefined, but the set still registers as a change
    pg.bulkData.set(undefined);
    await em.flush();

    const em2 = newEntityManager();
    const pg2 = await em2.load(ParentGroup, "parentGroup:1", "bulkData");
    expect(pg2.bulkData.get).toBeUndefined();
  });

  it("can blind-overwrite and then unset the lazy column", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "before" } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    // The unset must not look like a "revert" of the overwrite (the original db value is unknown)
    pg.bulkData.set({ key: "after" });
    pg.bulkData.set(undefined);
    await em.flush();

    const em2 = newEntityManager();
    const pg2 = await em2.load(ParentGroup, "parentGroup:1", "bulkData");
    expect(pg2.bulkData.get).toBeUndefined();
  });

  it("does not require an optional lazy column to be set on create", async () => {
    const em = newEntityManager();
    em.create(ParentGroup, { name: "pg1", requiredData: {} });
    await em.flush();
    const em2 = newEntityManager();
    const pg = await em2.load(ParentGroup, "parentGroup:1", "bulkData");
    expect(pg.bulkData.get).toBeUndefined();
  });

  describe("required (notNull) lazy columns", () => {
    it("requires the column to be set on create", async () => {
      const em = newEntityManager();
      // `requiredData` is a required opt at compile-time; omitting it fails validation at flush
      em.create(ParentGroup, { name: "pg1" } as any);
      await expect(em.flush()).rejects.toThrow("requiredData is required");
    });

    it("errors when unsetting the column on an existing entity", async () => {
      await insertParentGroup({ name: "pg1", required_data: { key: "value" } });
      const em = newEntityManager();
      const pg = await em.load(ParentGroup, "parentGroup:1");
      await pg.requiredData.load();
      pg.requiredData.set(undefined as any);
      await expect(em.flush()).rejects.toThrow("requiredData is required");
    });

    it("errors when unsetting a column that is not loaded", async () => {
      await insertParentGroup({ name: "pg1", required_data: { key: "value" } });
      const em = newEntityManager();
      const pg = await em.load(ParentGroup, "parentGroup:1");
      // Even though the unloaded column also reads as undefined, the set registers as a change
      pg.requiredData.set(undefined as any);
      await expect(em.flush()).rejects.toThrow("requiredData is required");
    });

    it("can blind-overwrite a column that is not loaded", async () => {
      await insertParentGroup({ name: "pg1", required_data: { key: "before" } });
      const em = newEntityManager();
      const pg = await em.load(ParentGroup, "parentGroup:1");
      // Setting a real value without loading first is fine, i.e. to avoid fetching a large blob just to replace it
      pg.requiredData.set({ key: "after" });
      // And the (unknown) original value doesn't leak the internal not-loaded marker
      expect(pg.changes.requiredData.hasChanged).toBe(true);
      expect(pg.changes.requiredData.originalValue).toBeUndefined();
      await em.flush();

      const em2 = newEntityManager();
      const pg2 = await em2.load(ParentGroup, "parentGroup:1", "requiredData");
      expect(pg2.requiredData.get).toEqual({ key: "after" });
    });

    it("does not false-fire required when the column is not loaded on an unrelated update", async () => {
      await insertParentGroup({ name: "pg1", required_data: { key: "value" } });
      const em = newEntityManager();
      const pg = await em.load(ParentGroup, "parentGroup:1");
      // Change only `name`; never load/touch the required lazy column
      pg.name = "renamed";
      await em.flush();
      // No false "required" error, and the value is preserved (excluded from the batch UPDATE)
      const em2 = newEntityManager();
      const pg2 = await em2.load(ParentGroup, "parentGroup:1", "requiredData");
      expect(pg2.name).toBe("renamed");
      expect(pg2.requiredData.get).toEqual({ key: "value" });
    });
  });

  it("preserves an unloaded lazy column when another entity in the batch updates it", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "one" } });
    await insertParentGroup({ name: "pg2", bulk_data: { key: "two" } });
    const em = newEntityManager();
    const [pg1, pg2] = await em.loadAll(ParentGroup, ["parentGroup:1", "parentGroup:2"]);
    // pg1 loads + changes its lazy column; pg2 never loads it and changes only `name`
    await pg1.bulkData.load();
    pg1.bulkData.set({ key: "one-updated" });
    pg2.name = "pg2-updated";
    await em.flush();

    // pg2's bulk_data must be preserved, not nulled by pg1's lazy-column change sharing the batch
    const em2 = newEntityManager();
    const [r1, r2] = await em2.loadAll(ParentGroup, ["parentGroup:1", "parentGroup:2"], "bulkData");
    expect(r1.bulkData.get).toEqual({ key: "one-updated" });
    expect(r2.bulkData.get).toEqual({ key: "two" });
    expect(r2.name).toBe("pg2-updated");
  });
});
