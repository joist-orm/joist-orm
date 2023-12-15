import { newBook } from "src/entities/index";
import { newEntityManager } from "src/testEm";

describe("EntityManager.defaults", () => {
  it("can default a synchronous field", async () => {
    const em = newEntityManager();
    // Create a new book with a defaulted notes
    const b = newBook(em, { title: "Book 1" });
    // Then the synchronous default was immediately applied
    expect(b.notes).toBe("Notes for Book 1");
  });

  it("does not overwrite existing sync default", async () => {
    const em = newEntityManager();
    // Create a new book with explicit notes
    const b = newBook(em, { title: "Book 1", notes: "my notes" });
    // Then the synchronous default did not overwrite them
    expect(b.notes).toBe("my notes");
  });

  it("can default an asynchronous field", async () => {
    const em = newEntityManager();
    // Given we create two books with their own author
    const b1 = newBook(em, { author: {}, order: undefined });
    const b2 = newBook(em, { author: {}, order: undefined });
    // And we kept the factory from applying the default
    expect(b1.order).toBeUndefined();
    expect(b2.order).toBeUndefined();
    // When we flush
    await em.flush();
    // Then the async default kicked in
    expect(b1.order).toBe(1);
    expect(b2.order).toBe(1);
  });

  it("does not overwrite existing async default", async () => {
    const em = newEntityManager();
    // Given we create two books with explicit orders
    const b1 = newBook(em, { author: {}, order: 3 });
    const b2 = newBook(em, { author: {}, order: 4 });
    // When we flush
    await em.flush();
    // Then the async default left them alone
    expect(b1.order).toBe(3);
    expect(b2.order).toBe(4);
  });
});
