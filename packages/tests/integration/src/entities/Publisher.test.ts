import { PublisherType, SmallPublisher } from "@src/entities";
import { newEntityManager } from "@src/testEm";

describe("Publisher", () => {
  it("has a default type", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    expect(p.type).toEqual(PublisherType.Big);
  });
});
