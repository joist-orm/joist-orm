import { LargePublisher, newSmallPublisher, Publisher, SmallPublisher } from "@src/entities";
import { newEntityManager } from "@src/testEm";
import { alias } from "joist-orm";
import { insertPublisher } from "src/entities/inserts";

describe("EntityManager.ctiQueries", () => {
  it("finds against child with simple parent filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1" });
    await em.flush();
    const res = await em.find(SmallPublisher, { name: "p1" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against parent with simple parent filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1" });
    await em.flush();
    const res = await em.find(Publisher, { name: "p1" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with simple child filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const res = await em.find(SmallPublisher, { city: "location" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with simple child & parent filter", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const res = await em.find(SmallPublisher, { name: "p1", city: "location" });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with complex child & parent filter, alias child", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const sp = alias(SmallPublisher);
    const res = await em.find(SmallPublisher, { as: sp }, { conditions: { and: [sp.name.eq("p1")] } });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against child with simple child & parent filter, parent alias", async () => {
    const em = newEntityManager();
    const sp1 = newSmallPublisher(em, { name: "p1", city: "location" });
    await em.flush();
    const p = alias(Publisher);
    const res = await em.find(SmallPublisher, { as: p }, { conditions: { and: [p.name.eq("p1")] } });
    expect(res).toMatchEntity([sp1]);
  });

  it("finds against both subtypes", async () => {
    await insertPublisher({ id: 1, name: "sp1" });
    await insertPublisher({ id: 2, name: "sp2" });
    const em = newEntityManager();
    const sps = await em.find(SmallPublisher, {});
    const lps = await em.find(LargePublisher, {});
    expect(sps).toMatchEntity([{}, {}]);
    expect(lps).toMatchEntity([]);
  });
});
