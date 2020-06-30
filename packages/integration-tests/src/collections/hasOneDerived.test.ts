import { BookReview } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertPublisher } from "@src/entities/factories";
import { knex } from "@src/setupDbTests";
import { EntityManager } from "joist-orm";

describe("hasOneDerived", () => {
  it("can load a reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const review = await em.load(BookReview, "1");
    const p1 = await review.publisher.load();
    expect(p1?.name).toEqual("p1");
  });

  it("can populate a reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "f", publisher_id: 1 });
    await insertBook({ title: "t", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = new EntityManager(knex);
    const p1 = await em.load(BookReview, "1", "publisher");
    expect(p1.publisher.get?.name).toEqual("p1");
  });
});
