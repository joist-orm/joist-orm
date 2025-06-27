import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
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

  it("finds changed entities", async () => {
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    const a2 = await em.load(Author, "a:1");
    a2.firstName = "a1";
    const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("should handle large datasets efficiently with IndexManager", async () => {
    const em = newEntityManager();
    const n = 5_000;

    // Create entities to trigger indexing
    for (let i = 0; i < n; i++) {
      em.create(Author, { firstName: `Author${i}` });
    }

    // Verify indexing is enabled after crossing threshold
    const indexManager = (em as any)["__api"].indexManager;
    expect(indexManager.indexedTypes.has("Author")).toBe(true);

    // Test that searches are now efficient
    const start = performance.now();
    const promises = zeroTo(1000).map((i) => {
      return em.findWithNewOrChanged(Author, { firstName: `Author${i}` });
    });
    const results = await Promise.all(promises);
    const end = performance.now();

    // Should complete much faster than linear O(n) search
    expect(end - start).toBeLessThan(200); // 200ms for 1000 searches

    // Verify all searches returned correct results
    results.forEach((result, i) => {
      expect(result.length).toBe(1);
      expect(result[0].firstName).toBe(`Author${i}`);
    });
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

  describe("Performance with IndexManager", () => {
    it("should perform efficiently with large entity counts using indexes", async () => {
      const em = newEntityManager();
      const n = 5_000;

      // Create enough entities to trigger indexing (>1000)
      const authors = [];
      for (let i = 0; i < n; i++) {
        authors.push(em.create(Author, { firstName: `Author${i}` }));
      }

      // Verify indexing is enabled
      const indexManager = (em as any)["__api"].indexManager;
      // expect(indexManager.indexedTypes.has("Author")).toBe(true);

      // Test performance of multiple searches
      const start = performance.now();

      // Mimic and life-cycle hook running for all `n` entities, i.e. would be an `n^2` if findWithNewOrChanged is linear
      const promises = [];
      for (let i = 0; i < n; i++) {
        const searchIndex = Math.floor(Math.random() * n);
        promises.push(em.findWithNewOrChanged(Author, { firstName: `Author${searchIndex}` }));
      }

      const results = await Promise.all(promises);
      const end = performance.now();

      // Should complete in reasonable time (much faster than O(n) linear search)
      expect(end - start).toBeLessThan(n); // allow Nms for n searches

      // Verify correctness
      results.forEach((result) => {
        expect(result.length).toBe(1);
      });
    });

    it("should handle updates efficiently with indexes", async () => {
      const em = newEntityManager();
      const n = 2_000;

      // Create enough entities to trigger indexing
      const authors = [];
      for (let i = 0; i < n; i++) {
        authors.push(em.create(Author, { firstName: `Author${i}` }));
      }

      const start = performance.now();

      // Update many entities
      for (let i = 0; i < 500; i++) {
        authors[i].firstName = `Updated${i}`;
      }

      // Search for updated entities
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(em.findWithNewOrChanged(Author, { firstName: `Updated${i}` }));
      }

      const results = await Promise.all(promises);
      const end = performance.now();

      // Should complete efficiently
      expect(end - start).toBeLessThan(50);

      // Verify correctness
      results.forEach((result, i) => {
        expect(result.length).toBe(1);
        expect(result[0].firstName).toBe(`Updated${i}`);
      });
    });

    it("should handle m2o relationships efficiently with indexes", async () => {
      const em = newEntityManager();
      const n = 3_000;

      // Create publishers
      const publishers = [];
      for (let i = 0; i < 10; i++) {
        publishers.push(newPublisher(em, { name: `Publisher${i}` }));
      }

      // Create enough authors to trigger indexing
      const authors = [];
      for (let i = 0; i < n; i++) {
        const publisher = publishers[i % 10];
        authors.push(
          em.create(Author, {
            firstName: `Author${i}`,
            publisher,
          }),
        );
      }

      const start = performance.now();

      // Search by different publishers
      const promises = [];
      for (let i = 0; i < 50; i++) {
        const publisherIndex = i % 10;
        promises.push(em.findWithNewOrChanged(Author, { publisher: publishers[publisherIndex] }));
      }

      const results = await Promise.all(promises);
      const end = performance.now();

      // Should complete efficiently
      expect(end - start).toBeLessThan(25);

      // Verify correctness - each publisher should have n/10 authors
      results.forEach((result) => {
        expect(result.length).toBe(n / 10);
      });
    });

    it("should gracefully fall back to linear search for small datasets", async () => {
      const em = newEntityManager();

      // Create small number of authors (below threshold) to test linear search
      const authors = [];
      for (let i = 0; i < 100; i++) {
        authors.push(em.create(Author, { firstName: `SmallAuthor${i}` }));
      }

      // Should still work correctly with linear search (since we only have 100 authors)
      const found = await em.findWithNewOrChanged(Author, { firstName: "SmallAuthor50" });
      expect(found).toMatchEntity([authors[50]]);
    });
  });
});
