import { insertPublisher, select } from "@src/entities/inserts";
import { Publisher, SmallPublisher } from "./entities";

import { newEntityManager, testDriver } from "@src/testEm";

describe("EntityManager.types", () => {
  it("supports decimals", async () => {
    const em = newEntityManager();
    // Given we make an entity with some decimals
    em.create(SmallPublisher, { name: "p1", latitude: 38.46281, longitude: -122.72805, city: "c1" });
    await em.flush();
    const rows = await select("publishers");
    if (testDriver.isInMemory) {
      expect(rows[0].latitude).toEqual(38.46281);
      expect(rows[0].longitude).toEqual(-122.72805);
    } else {
      // Then knex will read them as strings
      expect(rows[0].latitude).toEqual("38.462810");
      expect(rows[0].longitude).toEqual("-122.728050");
    }
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
    em.create(SmallPublisher, { name: "p1", latitude: 38.46281, city: "c1" });
    await em.flush();
    // Then we'll read it as undefined
    const em2 = newEntityManager();
    const p1 = await em2.load(Publisher, "p:1");
    expect(p1.longitude).toBeUndefined();
  });
});
