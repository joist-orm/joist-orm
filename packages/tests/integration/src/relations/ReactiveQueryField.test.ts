import { select } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { newBookReview, newLargePublisher } from "../entities";

describe("ReactiveQueryField", () => {
  it("can calculate on new insert", async () => {
    const em = newEntityManager();
    newLargePublisher(em);
    newBookReview(em);
    newBookReview(em);
    await em.flush();
    expect((await select("publishers"))[0]).toMatchObject({
      id: 1,
      number_of_book_reviews: 2,
    });
  });
});
