import { Author, Image, ImageType, SmallPublisher } from "@src/entities";
import { insertAuthor, insertImage } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";

describe("Image", () => {
  it("can have an owner", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    const i = em.create(Image, { type: ImageType.AuthorImage, author: a1, fileName: "f1" });
    await em.flush();
    expect(i.idOrFail).toEqual("i:1");
  });

  it("cannot have multiple owners", async () => {
    const em = newEntityManager();
    const p1 = em.create(SmallPublisher, { name: "p1", city: "c1" });
    const a1 = em.create(Author, { firstName: "a1" });
    const i = em.create(Image, { type: ImageType.AuthorImage, author: a1, publisher: p1, fileName: "f1" });
    await expect(em.flush()).rejects.toThrow("One and only one owner must be set");
  });

  it("has owner with an image", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertImage({ type_id: 2, author_id: 1, file_name: "i1" });
    const em = newEntityManager();
    const i1 = await em.load(Image, "1");
    expect(await i1.owner.load()).toBeInstanceOf(Author);
  });

  it("has owner that can preload", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertImage({ type_id: 2, author_id: 1, file_name: "i1" });
    const em = newEntityManager();
    const i1 = await em.load(Image, "1", "owner");
    expect((i1.owner.get! as Author).firstName).toEqual("a1");
  });
});
