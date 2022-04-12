import { Author, newAuthor } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";
import { getMetadata, tagId, tagIds } from "joist-orm";

describe("taggedIds", () => {
  it("can tag id", async () => {
    expect(tagId(Author, 1)).toEqual("a:1");
    expect(tagId(Author, "1")).toEqual("a:1");
    expect(tagId(Author, "a:1")).toEqual("a:1");
    expect(() => tagId(Author, "b:1")).toThrow("Invalid tagged id, expected tag a, got b:1");
    expect(tagId(Author, null)).toBeUndefined();
    expect(tagId(Author, undefined)).toBeUndefined();
    expect(tagId(getMetadata(Author), 1)).toEqual("a:1");
    expect(tagId(getMetadata(Author), "1")).toEqual("a:1");
  });

  it("can tag ids", async () => {
    expect(tagIds(Author, [1, 2])).toEqual(["a:1", "a:2"]);
    expect(tagIds(Author, ["1", "2", "a:3"])).toEqual(["a:1", "a:2", "a:3"]);
    expect(() => tagIds(Author, ["b:1"])).toThrow("Invalid tagged id, expected tag a, got b:1");
    expect(tagIds(getMetadata(Author), [1, 2])).toEqual(["a:1", "a:2"]);
    expect(tagIds(getMetadata(Author), ["1", "2"])).toEqual(["a:1", "a:2"]);
  });

  it("is type-safe with id and idOrFail", async () => {
    // Given we have an author
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // And we want to return an author
    let a2: Author;
    // Then we get a type error for assign the id to the entity
    // @ts-expect-error
    a2 = a.id;
    // @ts-expect-error
    a2 = a.idOrFail;
  });
});
