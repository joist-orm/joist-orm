import { Author, SmallPublisher } from "@src/entities";
import { newEntityManager } from "@src/testEm";

describe("AsyncQueryProperty", () => {
  it("throws when loading a new entity", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    expect(() => p.numberOfAuthors.load()).toThrow("has not been flushed yet");
  });

  it("returns the count for persisted entities", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    em.create(Author, { firstName: "a1", publisher: p });
    em.create(Author, { firstName: "a2", publisher: p });
    await em.flush();
    const result = await p.numberOfAuthors.load();
    expect(result).toBe(2);
  });

  it("caches the value until flush", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    em.create(Author, { firstName: "a1", publisher: p });
    await em.flush();
    expect(await p.numberOfAuthors.load()).toBe(1);
    expect(p.numberOfAuthors.get).toBe(1);
    // Add another author and flush
    em.create(Author, { firstName: "a2", publisher: p });
    await em.flush();
    // After flush, the cached value is invalidated
    expect(p.numberOfAuthors.isLoaded).toBe(false);
    expect(await p.numberOfAuthors.load()).toBe(2);
  });

  it("throws if accessing get before load", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    await em.flush();
    expect(() => p.numberOfAuthors.get).toThrow("AsyncQueryProperty has not been loaded yet");
  });

  it("can be loaded via populate hint", async () => {
    const em = newEntityManager();
    const p = em.create(SmallPublisher, { name: "p1", city: "c1" });
    em.create(Author, { firstName: "a1", publisher: p });
    em.create(Author, { firstName: "a2", publisher: p });
    await em.flush();
    const loaded = await em.populate(p, "numberOfAuthors");
    expect(loaded.numberOfAuthors.get).toBe(2);
  });
});
