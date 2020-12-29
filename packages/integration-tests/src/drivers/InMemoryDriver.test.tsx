import { Author, Publisher } from "@src/entities";
import { insertAuthor, insertPublisher } from "@src/entities/inserts-memory";
import { driver, newEntityManager } from "@src/setupMemoryTests";
import { getMetadata } from "joist-orm";

describe("InMemoryDriver", () => {
  describe("flushEntities", () => {
    it("can insert", async () => {
      const em = newEntityManager();
      await em.driver.flushEntities({
        Author: {
          metadata: getMetadata(Author),
          inserts: [new Author(em, { firstName: "a1" })],
          deletes: [],
          updates: [],
          validates: [],
        },
      });
      const authors = driver.select("authors");
      expect(authors.length).toEqual(1);
      expect(authors[0].id).toEqual("1");
      expect(authors[0].first_name).toEqual("a1");
      expect(authors[0].graduated).toEqual(null);
    });
  });

  it("can loadOneToMany", async () => {
    // Given a publisher with two authors
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    // And we create a dummy publisher to get the authors
    const em = newEntityManager();
    const p2 = em.create(Publisher, { name: "p2" });
    // Purposefully using
    const rows = await driver.loadOneToMany(p2.authors as any, ["1"]);
    expect(rows.length).toEqual(2);
  });
});
