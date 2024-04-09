import { newArtist } from "./entities.js";

describe("Artist", () => {
  it("works", async () => {
    const em = newEntityManager();
    newArtist(em);
    await em.flush();
  });
});
