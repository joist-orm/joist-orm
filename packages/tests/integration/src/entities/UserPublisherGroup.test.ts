import { newUserPublisherGroup } from "./entities";

describe("UserPublisherGroup", () => {
  it("works", async () => {
    const em = newEntityManager();
    newUserPublisherGroup(em);
    await em.flush();
  });
});
