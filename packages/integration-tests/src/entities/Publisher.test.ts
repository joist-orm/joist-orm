import { Publisher } from "@src/entities/Publisher";
import { PublisherType } from "@src/entities/PublisherType";
import { newEntityManager } from "@src/setupDbTests";

describe("Publisher", () => {
  it("can have business logic methods", async () => {
    const em = newEntityManager();
    const p = em.create(Publisher, { name: "p1" });
    expect(p.type).toEqual(PublisherType.Small);
  });
});
