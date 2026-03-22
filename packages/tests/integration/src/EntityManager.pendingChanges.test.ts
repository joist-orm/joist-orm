import { insertAuthor, insertAuthorToTag, insertTag } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { Author, Tag, newAuthor, newBook } from "./entities";

describe("EntityManager.pendingChanges", () => {
  it("is empty when no changes exist", async () => {
    const em = newEntityManager();
    expect(em.pendingChanges).toMatchEntity([]);
  });

  it("includes a new entity as a create", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    expect(em.pendingChanges).toMatchEntity([{ kind: "create", entity: a }]);
  });

  it("includes a dirty entity as an update", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    a.firstName = "a2";
    expect(em.pendingChanges).toMatchEntity([{ kind: "update", entity: a }]);
  });

  it("includes a deleted entity as a delete", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    em.delete(a);
    expect(em.pendingChanges).toMatchEntity([{ kind: "delete", entity: a }]);
  });

  it("includes a touched entity as an update", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    em.touch(a);
    expect(em.pendingChanges).toMatchEntity([{ kind: "update", entity: a }]);
  });

  it("excludes a created-then-deleted entity", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    em.delete(a);
    expect(em.pendingChanges).toMatchEntity([]);
  });

  it("excludes clean loaded entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    await em.load(Author, "a:1");
    expect(em.pendingChanges).toMatchEntity([]);
  });

  it("includes multiple entity types", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const b = newBook(em, { author: a });
    expect(em.pendingChanges).toMatchEntity([
      { kind: "create", entity: a },
      { kind: "create", entity: b },
    ]);
  });

  it("includes m2m add", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "t1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const t = await em.load(Tag, "t:1");
    a.tags.add(t);
    expect(em.pendingChanges).toMatchEntity([
      { kind: "m2m", op: "add", joinTableName: "authors_to_tags", entities: [a, t] },
    ]);
  });

  it("includes m2m remove", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "t1" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", "tags");
    const t = a.tags.get[0];
    a.tags.remove(t);
    expect(em.pendingChanges).toMatchEntity([
      { kind: "m2m", op: "remove", joinTableName: "authors_to_tags", entities: [a, t] },
    ]);
  });

  it("includes both m2m add and remove", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", "tags");
    const t1 = a.tags.get[0];
    const t2 = await em.load(Tag, "t:2");
    a.tags.remove(t1);
    a.tags.add(t2);
    expect(em.pendingChanges).toMatchEntity([
      { kind: "m2m", op: "add", joinTableName: "authors_to_tags", entities: [a, t2] },
      { kind: "m2m", op: "remove", joinTableName: "authors_to_tags", entities: [a, t1] },
    ]);
  });

  it("m2m re-add cancels out to no change", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "t1" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1", "tags");
    const t = a.tags.get[0];
    a.tags.remove(t);
    a.tags.add(t);
    expect(em.pendingChanges).toMatchEntity([]);
  });

  it("resets after flush", async () => {
    const em = newEntityManager();
    newAuthor(em);
    expect(em.pendingChanges.length).toBeGreaterThan(0);
    await em.flush();
    expect(em.pendingChanges).toMatchEntity([]);
  });

  it("new entity is create not update", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    expect(em.pendingChanges).toMatchEntity([{ kind: "create", entity: a }]);
    expect(em.pendingChanges.every((c) => c.kind !== "update")).toBe(true);
  });
});
