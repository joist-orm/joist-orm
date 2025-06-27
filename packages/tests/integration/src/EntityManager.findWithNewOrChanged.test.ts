import { insertAuthor, insertPublisher } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
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
});
