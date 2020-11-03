import { insertPublisher } from "@src/entities/inserts";
import { Publisher } from "./entities";
import { knex, newEntityManager } from "./setupDbTests";

describe("EntityManager", () => {
  it("supports decimals", async () => {
    const em = newEntityManager();
    // Given we make an entity with some decimals
    await em.create(Publisher, { name: "p1", latitude: 38.46281, longitude: -122.72805 });
    await em.flush();
    // Then knex will read them as strings
    const rows = await knex.select("*").from("publishers");
    expect(rows[0].latitude).toEqual("38.462810");
    expect(rows[0].longitude).toEqual("-122.728050");
    // And we'll read them as numbers
    const em2 = newEntityManager();
    const p1 = await em2.load(Publisher, "p:1");
    expect(p1.latitude).toEqual(38.46281);
    expect(p1.longitude).toEqual(-122.72805);
  });

  it("doesn't blow up on huge decimals", async () => {
    await insertPublisher({
      name: "foo",
      // This is above max integer's 2^51 - 1
      huge_number: "10,000,000,000,000,000".replace(/,/g, ""),
    });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1");
    expect(p1.hugeNumber).toEqual(10_000_000_000_000_000);
  });

  it("supports null decimals", async () => {
    const em = newEntityManager();
    // Given longitude is left null
    await em.create(Publisher, { name: "p1", latitude: 38.46281 });
    await em.flush();
    // Then we'll read it as undefined
    const em2 = newEntityManager();
    const p1 = await em2.load(Publisher, "p:1");
    expect(p1.longitude).toBeUndefined();
  });
});
