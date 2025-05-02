const em = new EntityManager();
await em.upsert(CostCode, { id: "1" }, { name: "test" });
