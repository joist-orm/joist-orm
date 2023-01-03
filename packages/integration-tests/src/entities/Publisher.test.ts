import { PublisherType } from "@src/entities/PublisherType";
import { SmallPublisher } from "@src/entities/SmallPublisher";
import { newEntityManager } from "@src/setupDbTests";

describe("Publisher", () => {
  it("has a default type", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    expect(p.type).toEqual(PublisherType.Big);
  });
});
