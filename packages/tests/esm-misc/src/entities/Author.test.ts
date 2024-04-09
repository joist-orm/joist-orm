import { newAuthor } from "./entities";

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});
