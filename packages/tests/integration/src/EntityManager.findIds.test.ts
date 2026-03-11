import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, queries, resetQueryCount } from "@src/testEm";
import { oneTo } from "src/utils";
import { Author, Publisher } from "./entities";

describe("EntityManager.findIds.batch", () => {
  it("batches findIds queries with same structure", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    // Given two queries with exactly the same where clause structure
    const q1p = em.findIds(Author, { firstName: "a1" });
    const q2p = em.findIds(Author, { firstName: "a2" });
    // When they are executed in the same event loop
    const [q1, q2] = await Promise.all([q1p, q2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And the results are correct
    expect(q1).toEqual(["a:1"]);
    expect(q2).toEqual(["a:2"]);
  });

  it("batches findIds queries with multiple conditions", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    resetQueryCount();
    const em = newEntityManager();
    const q1p = em.findIds(Author, { firstName: "a1", lastName: "l1" });
    const q2p = em.findIds(Author, { firstName: "a2", lastName: "l2" });
    const [q1, q2] = await Promise.all([q1p, q2p]);
    expect(numberOfQueries).toEqual(1);
    expect(q1).toEqual(["a:1"]);
    expect(q2).toEqual(["a:2"]);
  });

  it("returns empty arrays for no matches", async () => {
    await insertAuthor({ first_name: "a1" });
    resetQueryCount();
    const em = newEntityManager();
    const q1p = em.findIds(Author, { firstName: "a1" });
    const q2p = em.findIds(Author, { firstName: "nonexistent" });
    const [q1, q2] = await Promise.all([q1p, q2p]);
    expect(numberOfQueries).toEqual(1);
    expect(q1).toEqual(["a:1"]);
    expect(q2).toEqual([]);
  });

  it("returns multiple IDs when query matches multiple entities", async () => {
    await insertAuthor({ first_name: "a1", last_name: "common" });
    await insertAuthor({ first_name: "a2", last_name: "common" });
    await insertAuthor({ first_name: "a3", last_name: "other" });
    resetQueryCount();
    const em = newEntityManager();
    const q1p = em.findIds(Author, { lastName: "common" });
    const q2p = em.findIds(Author, { lastName: "other" });
    const [q1, q2] = await Promise.all([q1p, q2p]);
    expect(numberOfQueries).toEqual(1);
    expect(q1).toMatchObject(["a:1", "a:2"]);
    expect(q2).toEqual(["a:3"]);
  });

  it("handles single query without CTE overhead", async () => {
    await insertAuthor({ first_name: "a1" });
    resetQueryCount();
    const em = newEntityManager();
    const ids = await em.findIds(Author, { firstName: "a1" });
    expect(numberOfQueries).toEqual(1);
    expect(ids).toEqual(["a:1"]);
    // Verify no CTE/VALUES syntax in single query
    expect(queries[0]).not.toContain("WITH _find");
  });

  it("batches findIds with CTI entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    resetQueryCount();
    const em = newEntityManager();
    const q1p = em.findIds(Publisher, { name: "p1" });
    const q2p = em.findIds(Publisher, { name: "p2" });
    const [q1, q2] = await Promise.all([q1p, q2p]);
    expect(numberOfQueries).toEqual(1);
    expect(q1).toEqual(["p:1"]);
    expect(q2).toEqual(["p:2"]);
  });

  it("does not do its own distinct during joins", async () => {
    // This is a regression test for a bug where the data loader was doing its own distinct
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const ids = await em.findIds(Author, { publisher: { name: "p1" } });
    expect(ids).toEqual(["a:1"]);
  });

  it("does not apply entity limit to the query", async () => {
    await Promise.all(oneTo(10, (i) => insertAuthor({ first_name: `a${i}` })));
    const em = newEntityManager();
    em.entityLimit = 5;
    const ids = await em.findIds(Author, {});
    expect(ids).toHaveLength(10);
  });

  it("does not apply entity limit to the query while batching", async () => {
    await Promise.all(oneTo(10, (i) => insertAuthor({ first_name: `a${i}`, last_name: i % 2 === 0 ? "even" : "odd" })));
    const em = newEntityManager();
    em.entityLimit = 3;
    const oddsPromise = em.findIds(Author, { lastName: "odd" });
    const evensPromise = em.findIds(Author, { lastName: "even" });
    const [odds, evens] = await Promise.all([oddsPromise, evensPromise]);
    expect(odds).toHaveLength(5);
    expect(evens).toHaveLength(5);
  });
});
