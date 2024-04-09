import { newPainting } from "./entities.js";

describe("Painting", () => {
  it("works", async () => {
    const em = newEntityManager();
    newPainting(em);
    await em.flush();
  });
});
