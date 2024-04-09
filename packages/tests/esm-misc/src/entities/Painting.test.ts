import { newPainting } from "./entities";

describe("Painting", () => {
  it("works", async () => {
    const em = newEntityManager();
    newPainting(em);
    await em.flush();
  });
});
