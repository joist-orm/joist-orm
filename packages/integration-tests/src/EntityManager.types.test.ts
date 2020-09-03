import { EntityManager } from "joist-orm";
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
});
