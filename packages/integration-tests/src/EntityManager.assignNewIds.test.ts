import { isNew } from "joist-orm";
import { newPublisher } from "./entities";
import { newEntityManager } from "./setupDbTests";

describe("EntityManager.assignNewIds", () => {
  it("can assign entity IDs on request", async () => {
    const em = newEntityManager();

    // Given an entity
    const p1 = newPublisher(em, { name: "p1" });
    expect(p1.idMaybe).toBeUndefined();

    // When I ask to assign the ids
    await em.assignNewIds();
    // Then the ID was set appropriately and the entity is still considered new
    expect(p1.id).toEqual("p:1");
    expect(p1.isNewEntity).toEqual(true);
    expect(isNew(p1)).toEqual(true);

    // And when I flush
    await em.flush();
    // Then the id remains the same and the entity is no longer new
    expect(p1.id).toEqual("p:1");
    expect(p1.isNewEntity).toEqual(false);
    expect(isNew(p1)).toEqual(false);
  });

  it("batches when requesting assigned ids", async () => {
    const em = newEntityManager();

    // Given an entity
    const p1 = newPublisher(em, { name: "p1" });
    expect(p1.idMaybe).toBeUndefined();
    const p2 = newPublisher(em, { name: "p2" });
    expect(p2.idMaybe).toBeUndefined();

    await Promise.all([em.assignNewIds(), em.assignNewIds()]);
    expect(p1.id).toEqual("p:1");
    expect(p1.isNewEntity).toEqual(true);
    expect(isNew(p1)).toEqual(true);
    expect(p2.id).toEqual("p:2");
    expect(p2.isNewEntity).toEqual(true);
    expect(isNew(p2)).toEqual(true);

    // expect next id is 3
    const p3 = newPublisher(em, { name: "p3" });
    await em.assignNewIds();
    expect(p3.id).toEqual("p:3");
  });
});
