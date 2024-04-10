import { newAuthor } from "./entities.js";

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});
