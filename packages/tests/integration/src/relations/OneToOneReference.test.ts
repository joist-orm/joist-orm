import { insertAuthor, insertImage, select } from "@src/entities/inserts";
import { Author, Image, ImageType, newAuthor, newImage } from "../entities";
import { newEntityManager, numberOfQueries, resetQueryCount } from "../setupDbTests";

describe("OneToOneReference", () => {
  it("can load a set reference", async () => {
    await insertAuthor({ first_name: "f" });
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    const image = await author.image.load();
    expect(image?.fileName).toEqual("f1");
  });

  it("can load an unset reference", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1", "image");
    expect(author.image.get).toBeUndefined();
  });

  it("can save when set", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { firstName: "a1" });
    expect(author.image.isSet).toEqual(false);
    const image = new Image(em, { fileName: "f1", type: ImageType.AuthorImage });
    author.image.set(image);
    expect(author.image.isSet).toEqual(true);
    await em.flush();

    const rows = await select("images");
    expect(rows[0].author_id).toEqual(1);
  });

  it("batch loads references keys", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });
    await insertImage({ type_id: 2, file_name: "f2", author_id: 2 });

    const em = newEntityManager();
    const [a1, a2] = await em.loadAll(Author, ["1", "2"]);
    resetQueryCount();
    const [i1, i2] = await Promise.all([a1.image.load(), a2.image.load()]);
    expect(i1?.fileName).toEqual("f1");
    expect(i2?.fileName).toEqual("f2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can unset a reference indirectly", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });

    const em = newEntityManager();
    const [a1, a2] = await em.loadAll(Author, ["1", "2"], "image");
    const i1 = await em.load(Image, "1", "author");
    i1.author.set(a2);
    expect(a1.image.get).toBeUndefined();
    expect(a2.image.get).toEqual(i1);
  });

  it("can be passed as an opt", async () => {
    const em = newEntityManager();
    const image = em.create(Image, { type: ImageType.AuthorImage, fileName: "f1" });
    const author = em.create(Author, { firstName: "a1", image });
    expect(author.image.get).toEqual(image);
  });

  it("can have get called on a new instance", async () => {
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "a1" });
    expect(author.image.get).toBeUndefined();
  });

  it("cannot call get if not loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    expect(() => {
      // @ts-expect-error
      a1.image.get;
    }).toThrow("get was called when not loaded");
  });

  it("can be set without being loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const i1 = em.create(Image, { type: ImageType.AuthorImage, fileName: "f1" });
    a1.image.set(i1);
    expect(a1.image.get).toEqual(i1);
  });

  it("can refresh", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "image");
    expect(a1.image.get).toBeUndefined();
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });
    await em.refresh();
    expect(a1.image.get?.fileName).toEqual("f1");
  });

  it("id fails if not loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    // Use `as any` b/c we're purposefully not loading the o2o
    expect(() => (a1.image as any).id).toThrow("Author:1.image was not loaded");
    expect(() => (a1.image as any).idMaybe).toThrow("Author:1.image was not loaded");
    expect(() => (a1.image as any).idIfSet).toThrow("Author:1.image was not loaded");
    await a1.image.load();
    expect(() => (a1.image as any).id).toThrow("Reference is unset");
    expect((a1.image as any).idMaybe).toBeUndefined();
    expect((a1.image as any).idIfSet).toBeUndefined();
  });

  it("id fails if set to a new entity loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "image");
    a1.image.set(newImage(em));
    expect(() => a1.image.id).toThrow("Reference is assigned to a new entity");
    expect(() => a1.image.idIfSet).toThrow("Reference is assigned to a new entity");
  });

  it("can cascade delete", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "image");
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });
    await em.refresh();
    expect(a1.image.isSet).toBe(true);
    em.delete(a1);
    await em.flush();
    expect((await select("images")).length).toEqual(0);
  });

  it("can delete", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "image");
    expect(a1.image.isSet).toBe(false);
    em.delete(a1);
    await em.flush();
    expect((await select("authors")).length).toEqual(0);
  });

  it("throws exception when image is not loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    expect(() => (a1.image as any).isSet).toThrow("Author:1.image was not loaded");
  });

  it("can be renamed", () => {
    // see createTable("users",...) in 1580658856631_author.ts for the actual rename
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "a1" });
    expect((author as any).user).not.toBeDefined();
    expect(author.userOneToOne).toBeDefined();
  });
});
