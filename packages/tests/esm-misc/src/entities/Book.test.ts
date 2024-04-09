import { newBook } from "./entities";

describe("Book", () => {
  it("works", async () => {
    const em = newEntityManager();
    newBook(em);
    await em.flush();
  });
});
