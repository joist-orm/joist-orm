import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { getEmInternalApi } from "joist-orm";
import { zeroTo } from "src/utils";
import { Author, newPublisher } from "./entities";

describe("EntityManager.findWithNewOrChanged", () => {
  it("finds existing, unloaded entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("finds existing, loaded entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    await em.find(Author, {});
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("finds new entities", async () => {
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    em.create(Author, { firstName: "a1" });
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("finds new entities with empty where and indexed", async () => {
    // Create enough authors to enable indexing
    for (let i = 1; i <= 1000; i++) await insertAuthor({ first_name: `a${i}` });
    const em = newEntityManager();
    // And we create one more
    const a = em.create(Author, { firstName: "a1" });
    let authors = await em.findWithNewOrChanged(Author, {});
    expect(authors.length).toBe(1001);
    // But if we delete it
    em.delete(a);
    // Then we don't see it
    authors = await em.findWithNewOrChanged(Author, {});
    expect(authors.length).toBe(1000);
  });

  it("finds changed entities", async () => {
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const a2 = await em.load(Author, "a:1");
    a2.firstName = "a1";
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("ignores changed entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a2 = await em.load(Author, "a:1");
    a2.firstName = "a2";
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([]);
  });

  it("ignores deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    em.delete(a);
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([]);
  });

  it("ignores deleted and changed entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    a.lastName = "l1";
    em.delete(a);
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([]);
  });

  it("can populate found & created entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a1", last_name: "last", publisher_id: 1 });
    const em = newEntityManager();
    em.create(Author, { firstName: "a2", lastName: "last", publisher: "p:2" });
    const authors = await em.findWithNewOrChanged(Author, { lastName: "last" }, { populate: "publisher" });
    expect(authors).toMatchEntity([{ publisher: { name: "p1" } }, { publisher: { name: "p2" } }]);
  });

  it("finds changed entities w/m2o to new entity", async () => {
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const a2 = await em.load(Author, "a:1");
    const p = newPublisher(em, { name: "p1" });
    a2.publisher.set(p);
    const authors = await em.findWithNewOrChanged(Author, { publisher: p });
    expect(authors).toMatchEntity([a2]);
  });

  it("finds changed entities w/m2o is newly unset with undefined", async () => {
    await insertPublisher({ name: "p1 " });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertAuthor({ first_name: "a3" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    a1.publisher.set(undefined);
    const authors = await em.findWithNewOrChanged(Author, { publisher: undefined });
    expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a3" }, { firstName: "a1" }]);
  });

  it("finds changed entities w/m2o is newly unset with null", async () => {
    await insertPublisher({ name: "p1 " });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertAuthor({ first_name: "a3" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    a1.publisher.set(undefined);
    const authors = await em.findWithNewOrChanged(Author, { publisher: null });
    expect(authors).toMatchEntity([{ firstName: "a3" }, { firstName: "a1" }]);
  });

  it("finds changed entities w/m2o is persisted unset with undefined", async () => {
    await insertPublisher({ name: "p1 " });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertAuthor({ first_name: "a3" });
    const em = newEntityManager();
    const authors = await em.findWithNewOrChanged(Author, { publisher: undefined });
    expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }, { firstName: "a3" }]);
  });

  it("finds changed entities w/m2o is persisted unset with null", async () => {
    await insertPublisher({ name: "p1 " });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertAuthor({ first_name: "a3" });
    const em = newEntityManager();
    const authors = await em.findWithNewOrChanged(Author, { publisher: null });
    expect(authors).toMatchEntity([{ firstName: "a3" }]);
  });

  describe("indexed", () => {
    it("should handle large datasets efficiently with IndexManager", async () => {
      const em = newEntityManager();
      const n = 5_000;
      // Create entities to trigger indexing
      zeroTo(n).forEach((i) => em.create(Author, { firstName: `Author${i}` }));
      // Test that searches are now efficient
      const start = performance.now();
      const results = await Promise.all(
        zeroTo(n).map((i) => em.findWithNewOrChanged(Author, { firstName: `Author${i}` })),
      );
      const end = performance.now();
      // Verify indexing is enabled after crossing threshold
      expect(getEmInternalApi(em).indexManager.isIndexed("a")).toBe(true);
      // Should complete much faster than linear O(n) search
      expect(end - start).toBeLessThan(n); // Nms for n searches
      // Verify all searches returned correct results
      results.forEach((result, i) => {
        expect(result.length).toBe(1);
        expect(result[0].firstName).toBe(`Author${i}`);
      });
    });

    it("should handle updates efficiently with indexes", async () => {
      const em = newEntityManager();
      const n = 5_000;
      // Given enough entities
      const authors = zeroTo(n).map((i) => em.create(Author, { firstName: `Author${i}` }));
      // And a find has triggered index creation
      await em.findWithNewOrChanged(Author, { firstName: "a1" });
      // When we update many entities
      const start = performance.now();
      for (let i = 0; i < n; i++) {
        authors[i].firstName = `Updated${i}`;
      }
      // And we search for the updated entities
      const results = await Promise.all(
        zeroTo(n).map((i) => em.findWithNewOrChanged(Author, { firstName: `Updated${i}` })),
      );
      const end = performance.now();
      // Then it should complete efficiently
      expect(end - start).toBeLessThan(n);
      // And with the right results
      results.forEach((result, i) => {
        expect(result.length).toBe(1);
        expect(result[0].firstName).toBe(`Updated${i}`);
      });
    });

    it("should handle m2o relationships efficiently with indexes", async () => {
      const em = newEntityManager();
      const n = 5_000;
      // Given some publishers
      const publishers = zeroTo(10).map((i) => newPublisher(em, { name: `Publisher${i}` }));
      // And enough authors to trigger indexing
      const authors = zeroTo(n).map((i) => {
        const publisher = publishers[i % 10];
        return em.create(Author, { firstName: `Author${i}`, publisher });
      });
      const start = performance.now();
      // When we search by different publishers
      const results = await Promise.all(publishers.map((publisher) => em.findWithNewOrChanged(Author, { publisher })));
      const end = performance.now();
      // Then it should complete efficiently
      expect(end - start).toBeLessThan(n);
      // And each publisher should have n/10 authors
      results.forEach((result) => {
        expect(result.length).toBe(n / 10);
      });
    });
  });
});
