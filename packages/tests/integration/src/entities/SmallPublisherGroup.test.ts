import { newEntityManager } from "src/testEm";
import { newSmallPublisherGroup } from "./entities";

describe("SmallPublisherGroup", () => {
  it("works", async () => {
    const em = newEntityManager();
    newSmallPublisherGroup(em);
    await em.flush();
  });
});
