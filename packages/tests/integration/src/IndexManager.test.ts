import { newEntityManager } from "@src/testEm";
import { getEmInternalApi } from "joist-orm";
import { Author, newPublisher } from "./entities";
import { zeroTo } from "./utils";

describe("IndexManager", () => {
  it("should not enable indexing for entity types with < 1000 entities", async () => {
    const em = newEntityManager();
    // Create 999 authors
    for (let i = 0; i < 999; i++) {
      em.create(Author, { firstName: `Author${i}` });
    }
    // And `find...` to potentially trigger index creation
    await em.findWithNewOrChanged(Author, { firstName: "..." });
    // Then indexing should not be enabled for Author type
    expect(getEmInternalApi(em).indexManager.isIndexed("a")).toBe(false);
  });

  it("should enable indexing when entity count reaches 1000", async () => {
    const em = newEntityManager();
    // Create 1000 authors
    for (let i = 0; i < 1000; i++) {
      em.create(Author, { firstName: `Author${i}` });
    }
    // And `find...` to potentially trigger index creation
    await em.findWithNewOrChanged(Author, { firstName: "..." });
    // IndexManager should now be enabled for Author type
    expect(getEmInternalApi(em).indexManager.isIndexed("a")).toBe(true);
  });

  it("should find entities using indexes when enabled", async () => {
    const em = newEntityManager();
    // Create 1100 authors to trigger indexing
    const authors = zeroTo(1100).map((i) => em.create(Author, { firstName: `Author${i}` }));
    // Should use indexed search
    const found = await em.findWithNewOrChanged(Author, { firstName: "Author500" });
    expect(found).toMatchEntity([authors[500]]);
  });

  it("should handle m2o fields with saved entities", async () => {
    const em = newEntityManager();
    // Create publisher first and flush to get ID
    const publisher = newPublisher(em, { name: "Test Publisher" });
    // Create a dummy author for LargePublisher validation
    const spotlightAuthor = em.create(Author, { firstName: "Spotlight" });
    if ("spotlightAuthor" in publisher) {
      (publisher as any).spotlightAuthor.set(spotlightAuthor);
    }
    await em.flush();
    // Create 1000+ authors to trigger indexing
    const authors = zeroTo(1100).map((i) =>
      em.create(Author, {
        firstName: `Author${i}`,
        publisher: i < 500 ? publisher : undefined,
      }),
    );
    // Should find authors by publisher using indexes
    const found = await em.findWithNewOrChanged(Author, { publisher });
    expect(found.length).toBe(500);
    expect(found).toMatchEntity(authors.slice(0, 500));
  });

  it("should handle m2o fields with unsaved entities", async () => {
    const em = newEntityManager();
    // Create unsaved publisher
    const publisher = newPublisher(em, { name: "Unsaved Publisher" });
    // Create 1000+ authors to trigger indexing
    const authors = zeroTo(1100).map((i) =>
      em.create(Author, {
        firstName: `Author${i}`,
        publisher: i < 300 ? publisher : undefined,
      }),
    );
    // Should find authors by unsaved publisher using instance-based index
    const found = await em.findWithNewOrChanged(Author, { publisher });
    expect(found.length).toBe(300);
    expect(found).toMatchEntity(authors.slice(0, 300));
  });

  it("should handle null/undefined m2o fields", async () => {
    const em = newEntityManager();
    // Create 1000+ authors to trigger indexing
    const authors = zeroTo(1100).map((i) =>
      em.create(Author, {
        firstName: `NullAuthor${i}`,
        // Don't set publisher to leave it undefined
      }),
    );
    // Should find authors with null publisher
    const found = await em.findWithNewOrChanged(Author, { publisher: undefined });
    expect(found.length).toBe(1100);
  });

  it("should update indexes when field values change", async () => {
    const em = newEntityManager();
    // Create 1000+ authors to trigger indexing
    const authors = zeroTo(1100).map((i) => em.create(Author, { firstName: `Author${i}` }));
    // Change an author's name
    authors[500].firstName = "Changed Name";
    // Should find by new name
    const foundByNew = await em.findWithNewOrChanged(Author, { firstName: "Changed Name" });
    expect(foundByNew).toMatchEntity([authors[500]]);
    // Should not find by old name
    const foundByOld = await em.findWithNewOrChanged(Author, { firstName: "Author500" });
    expect(foundByOld).toMatchEntity([]);
  });

  it("should handle complex queries with multiple fields", async () => {
    const em = newEntityManager();
    const publisher1 = newPublisher(em, { name: "Publisher 1" });
    const publisher2 = newPublisher(em, { name: "Publisher 2" });
    // Create 1000+ authors to trigger indexing
    for (let i = 0; i < 1100; i++) {
      em.create(Author, {
        firstName: i % 2 === 0 ? "Even" : "Odd",
        lastName: `Author${i}`,
        publisher: i < 500 ? publisher1 : i < 800 ? publisher2 : undefined,
      });
    }
    // Should find authors matching multiple criteria
    const found = await em.findWithNewOrChanged(Author, {
      firstName: "Even",
      publisher: publisher1,
    });
    // Should find even-numbered authors (0, 2, 4, ..., 498) with publisher1
    expect(found.length).toBe(250); // 500 authors with publisher1, half are even
  });

  it("should fall back to linear search for non-indexed types", async () => {
    const em = newEntityManager();
    // Create only 100 authors (below threshold) to test linear search
    const authors = zeroTo(100).map((i) => em.create(Author, { firstName: `TestAuthor${i}` }));
    // Should use linear search since we're below the threshold
    const found = await em.findWithNewOrChanged(Author, { firstName: "TestAuthor50" });
    expect(found).toMatchEntity([authors[50]]);
    // Verify Author type is not indexed (below threshold)
    expect(getEmInternalApi(em).indexManager.isIndexed("a")).toBe(false);
  });

  it("should handle entity deletion from indexes", async () => {
    const em = newEntityManager();
    // Create 1000+ authors to trigger indexing
    const authors = zeroTo(1100).map((i) => em.create(Author, { firstName: `Author${i}` }));
    // Delete an author
    em.delete(authors[500]);
    // Should not find deleted author
    const found = await em.findWithNewOrChanged(Author, { firstName: "Author500" });
    expect(found).toMatchEntity([]);
  });

  it("should maintain index consistency during field updates", async () => {
    const em = newEntityManager();
    const publisher1 = newPublisher(em, { name: "Publisher 1" });
    const publisher2 = newPublisher(em, { name: "Publisher 2" });
    // Create 1000+ authors to trigger indexing
    const authors = zeroTo(1100).map((i) =>
      em.create(Author, {
        firstName: `Author${i}`,
        publisher: publisher1,
      }),
    );
    // Do an initial search to trigger indexing of authors
    await em.findWithNewOrChanged(Author, { publisher: publisher1 });
    // Then change publisher for some authors
    for (let i = 0; i < 100; i++) {
      authors[i].publisher.set(publisher2);
    }
    // Verify correct distribution
    const foundPub1 = await em.findWithNewOrChanged(Author, { publisher: publisher1 });
    const foundPub2 = await em.findWithNewOrChanged(Author, { publisher: publisher2 });
    expect(foundPub1.length).toBe(1000); // 1100 - 100 = 1000
    expect(foundPub2.length).toBe(100);
  });
});
