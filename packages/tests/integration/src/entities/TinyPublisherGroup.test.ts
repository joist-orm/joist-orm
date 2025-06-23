import { newTinyPublisherGroup } from "./entities";

describe("TinyPublisherGroup", () => {
  it("works", async () => {
    const em = newEntityManager();
    newTinyPublisherGroup(em);
    await em.flush();
  });
});
