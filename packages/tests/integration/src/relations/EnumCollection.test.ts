import { insertPublisher, insertPublisherLogoColor, select } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, queries, resetQueryCount } from "@src/testEm";
import { Color, Publisher, SmallPublisher, newSmallPublisher } from "../entities";

describe("EnumCollection", () => {
  it("can save a new entity with an enum collection", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: "p1", logoColors: [Color.Red, Color.Blue] });
    await em.flush();
    expect(await select("publisher_logo_colors")).toMatchObject([
      { publisher_id: 1, logo_color_id: 1 },
      { publisher_id: 1, logo_color_id: 3 },
    ]);
  });

  it("can load an enum collection", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1", "logoColors");
    expect(p.logoColors.get).toEqual([Color.Red, Color.Blue]);
  });

  it("throws when get is called while unloaded", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    expect(() => ((p as SmallPublisher).logoColors as any).get).toThrow("logoColors.get was called when not loaded");
  });

  it("can add and remove", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.add(Color.Green);
    p.logoColors.remove(Color.Red);
    expect(p.logoColors.get).toEqual([Color.Green]);
    await em.flush();
    expect(await select("publisher_logo_colors")).toMatchObject([{ publisher_id: 1, logo_color_id: 2 }]);
  });

  it("can set against a loaded collection", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 2 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.set([Color.Green, Color.Blue]);
    await em.flush();
    const em2 = newEntityManager();
    const p2 = await em2.load(Publisher, "p:1", "logoColors");
    expect(p2.logoColors.get).toEqual([Color.Green, Color.Blue]);
  });

  it("can set against an unloaded collection", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 2 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1");
    p.logoColors.set([Color.Blue]);
    await em.flush();
    expect(await select("publisher_logo_colors")).toMatchObject([{ publisher_id: 1, logo_color_id: 3 }]);
  });

  it("can check includes", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1");
    expect(await p.logoColors.includes(Color.Red)).toBe(true);
    expect(await p.logoColors.includes(Color.Blue)).toBe(false);
  });

  it("can filter by membership", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisher({ id: 2, name: "p2" });
    await insertPublisherLogoColor({ publisher_id: 2, logo_color_id: 3 });
    const em = newEntityManager();
    const ps = await em.find(Publisher, { logoColors: Color.Red });
    expect(ps.map((p) => p.name)).toEqual(["p1"]);
  });

  it("can filter by membership in a list", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisher({ id: 2, name: "p2" });
    await insertPublisherLogoColor({ publisher_id: 2, logo_color_id: 3 });
    await insertPublisher({ id: 3, name: "p3" });
    await insertPublisherLogoColor({ publisher_id: 3, logo_color_id: 2 });
    const em = newEntityManager();
    const ps = await em.find(Publisher, { logoColors: [Color.Red, Color.Blue] });
    expect(ps.map((p) => p.name)).toEqual(["p1", "p2"]);
  });

  it("lazily loads with a single query (no second table fetch)", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1");
    resetQueryCount();
    expect(await p.logoColors.load()).toEqual([Color.Red, Color.Blue]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT "plc".* FROM publisher_logo_colors AS plc WHERE plc.publisher_id = ANY($1) ORDER BY plc.id ASC",
     ]
    `);
  });

  it("filters via the join table", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    await em.find(SmallPublisher, { logoColors: Color.Red });
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT sp.*, sp_b0.*, sp.id as id FROM small_publishers AS sp LEFT OUTER JOIN publishers AS sp_b0 ON sp.id = sp_b0.id WHERE EXISTS (SELECT 1 FROM publisher_logo_colors AS plc WHERE sp.id = plc.publisher_id AND plc.logo_color_id = $1) ORDER BY sp.id ASC LIMIT $2",
     ]
    `);
  });

  it("can populate across multiple entities", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 2 });
    await insertPublisher({ id: 2, name: "p2" });
    await insertPublisherLogoColor({ publisher_id: 2, logo_color_id: 3 });
    const em = newEntityManager();
    const ps = await em.find(Publisher, {}, { populate: "logoColors" });
    expect(ps[0].logoColors.get).toEqual([Color.Red, Color.Green]);
    expect(ps[1].logoColors.get).toEqual([Color.Blue]);
  });

  it("returns an empty array when there are no rows", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    expect(p.logoColors.get).toEqual([]);
  });

  it("populates an empty collection as loaded-and-empty", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    const em = newEntityManager();
    const [p] = await em.find(Publisher, {}, { populate: "logoColors" });
    expect(p.logoColors.isLoaded).toBe(true);
    expect(p.logoColors.get).toEqual([]);
  });

  it("saving with an empty array writes no rows", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: "p1", logoColors: [] });
    await em.flush();
    expect(await select("publisher_logo_colors")).toEqual([]);
  });

  it("orders codes by enum id regardless of insertion order", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 2 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    expect(p.logoColors.get).toEqual([Color.Red, Color.Green, Color.Blue]);
  });

  it("dedupes duplicate codes when saving", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: "p1", logoColors: [Color.Red, Color.Red, Color.Blue] });
    await em.flush();
    expect(await select("publisher_logo_colors")).toMatchObject([
      { publisher_id: 1, logo_color_id: 1 },
      { publisher_id: 1, logo_color_id: 3 },
    ]);
  });

  it("ignores adding a color that is already present", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.add(Color.Red);
    expect(p.logoColors.get).toEqual([Color.Red]);
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toBe(0);
    expect(await select("publisher_logo_colors")).toMatchObject([{ publisher_id: 1, logo_color_id: 1 }]);
  });

  it("adding then removing the same color before flush is a no-op", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.add(Color.Red);
    p.logoColors.remove(Color.Red);
    expect(p.logoColors.get).toEqual([]);
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toBe(0);
    expect(await select("publisher_logo_colors")).toEqual([]);
  });

  it("removing then re-adding a persisted color is a no-op", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.remove(Color.Red);
    p.logoColors.add(Color.Red);
    expect(p.logoColors.get).toEqual([Color.Red]);
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toBe(0);
    expect(await select("publisher_logo_colors")).toMatchObject([{ publisher_id: 1, logo_color_id: 1 }]);
  });

  it("setting the same values issues no writes", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.set([Color.Red, Color.Blue]);
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toBe(0);
  });

  it("removeAll clears the collection", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.removeAll();
    expect(p.logoColors.get).toEqual([]);
    await em.flush();
    expect(await select("publisher_logo_colors")).toEqual([]);
  });

  it("set([]) clears the collection", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1", "logoColors");
    p.logoColors.set([]);
    await em.flush();
    expect(await select("publisher_logo_colors")).toEqual([]);
  });

  it("cascades the join rows when the entity is deleted", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    const em = newEntityManager();
    const p = await em.load(SmallPublisher, "p:1");
    em.delete(p);
    await em.flush();
    expect(await select("publisher_logo_colors")).toEqual([]);
  });

  it("does not insert join rows for a new entity that is deleted before flush", async () => {
    const em = newEntityManager();
    const p = newSmallPublisher(em, { name: "p1", logoColors: [Color.Red] });
    em.delete(p);
    await em.flush();
    expect(await select("publisher_logo_colors")).toEqual([]);
  });

  it("returns a matching entity only once when multiple colors match", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 3 });
    const em = newEntityManager();
    const ps = await em.find(Publisher, { logoColors: [Color.Red, Color.Blue] });
    expect(ps.map((p) => p.name)).toEqual(["p1"]);
  });

  it("batch loads multiple collections in a single query", async () => {
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisherLogoColor({ publisher_id: 1, logo_color_id: 1 });
    await insertPublisher({ id: 2, name: "p2" });
    await insertPublisherLogoColor({ publisher_id: 2, logo_color_id: 3 });
    const em = newEntityManager();
    const [p1, p2] = await Promise.all([em.load(SmallPublisher, "p:1"), em.load(SmallPublisher, "p:2")]);
    resetQueryCount();
    const [c1, c2] = await Promise.all([p1.logoColors.load(), p2.logoColors.load()]);
    expect(numberOfQueries).toBe(1);
    expect(c1).toEqual([Color.Red]);
    expect(c2).toEqual([Color.Blue]);
  });
});
