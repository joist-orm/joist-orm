import { newEntityManager } from "@src/setupDbTests";
import { BookReview, newBookReview } from "./entities";

describe("BookReview", () => {
  it("works", async () => {
    const em = newEntityManager();
    newBookReview(em);
    await em.flush();

    await em.find(BookReview, {});
  });
});
