import { newPublisher } from "./entities";
import { newEntityManager } from "./setupDbTests";
import { isNew } from "joist-orm";

describe("EntityManager.assignNewIds", () => {
  it("can assign entity IDs on request", async () => {
    const em = newEntityManager();

    // Given an entity
    const p1 = newPublisher(em, { name: "p1" });
    expect(p1.id).toBeUndefined();

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
});
