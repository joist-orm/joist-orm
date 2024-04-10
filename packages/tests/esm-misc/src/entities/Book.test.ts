import { newBook } from "./entities.js";

describe("Book", () => {
  it("works", async () => {
    const em = newEntityManager();
    newBook(em);
    await em.flush();
  });
});
