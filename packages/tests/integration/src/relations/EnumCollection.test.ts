import { insertPublisher, insertPublisherLogoColor, select } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
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
});
