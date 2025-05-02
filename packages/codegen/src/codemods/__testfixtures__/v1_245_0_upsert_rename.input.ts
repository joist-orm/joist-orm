const em = new EntityManager();
await em.createOrUpdatePartial(CostCode, { id: "1" }, { name: "test" });
