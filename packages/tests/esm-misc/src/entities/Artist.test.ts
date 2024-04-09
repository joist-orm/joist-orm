import { newArtist } from "./entities";

describe("Artist", () => {
  it("works", async () => {
    const em = newEntityManager();
    newArtist(em);
    await em.flush();
  });
});
