import { insertAuthor, insertBook, insertBookReview, insertPublisher, select } from "@src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "@src/testEm";
import { Publisher, newBookReview, newLargePublisher } from "../entities";

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

  it("can em.recalc to update the value", async () => {
    // Given an existing publisher with a stale value
    await insertPublisher({ id: 1, name: "p1", number_of_book_reviews: 0 });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    // And we load the entity
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    // And see the stale value
    expect(p.numberOfBookReviews.get).toBe(0);
    // When we recalc the entity
    resetQueryCount();
    await em.recalc(p);
    // Then we immediately see the recalc
    expect(p.numberOfBookReviews.get).toBe(1);
    await em.flush();
    // And the value is updated in the database
    expect((await select("publishers"))[0]).toMatchObject({
      id: 1,
      number_of_book_reviews: 1,
    });
    expect(queries).toContain(
      `select count(distinct "br".id) as count from book_reviews as br inner join books as b on br.book_id = b.id inner join authors as a on b.author_id = a.id where b.deleted_at is null and a.deleted_at is null and a.publisher_id = $1 limit $2`,
    );
  });
});
