import { deTagId, getMetadata, isTaggedId, tagFromId, tagId, tagIds, unsafeDeTagIds } from "joist-orm";
import { Author, newAuthor } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager } from "src/setupDbTests";

describe("slug ids", () => {
  it("hydrates integer database ids as slug ids", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [author] = await em.find(Author, {});

    expect(author.id).toEqual("a1");
    expect(author.idTagged).toEqual("a1");
    expect(author.idUntagged).toEqual("1");
  });

  it("assigns slug ids to new entities", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    await em.flush();

    expect(a1.id).toEqual("a1");
    expect(a2.id).toEqual("a2");
  });

  it("loads by slug or untagged id and reuses the identity map", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const bySlug = await em.load(Author, "a1");
    const byRawId = await em.load(Author, "1");
    const byGenericSlug = await em.load("a1");

    expect(byRawId).toBe(bySlug);
    expect(byGenericSlug).toBe(bySlug);
  });

  it("supports tagged id utilities", () => {
    const meta = getMetadata(Author);

    expect(tagId(Author, 1)).toEqual("a1");
    expect(tagId(Author, "1")).toEqual("a1");
    expect(tagId(Author, "a1")).toEqual("a1");
    // This is unexpected, but documents that tagId preserves user input instead of canonicalizing it.
    expect(tagId(Author, "001")).toEqual("a001");
    expect(tagId(Author, "a001")).toEqual("a001");
    expect(tagIds(meta, [1, "2", "a3"])).toEqual(["a1", "a2", "a3"]);
    expect(deTagId(meta, "a1")).toEqual("1");
    expect(unsafeDeTagIds(["a1", "author23"])).toEqual(["1", "23"]);
    // This fails because this test suite is globally configured to use slug ids.
    expect(unsafeDeTagIds(["a:1"])).toEqual([undefined]);
    expect(isTaggedId(meta, "a1")).toEqual(true);
    expect(isTaggedId(meta, "1")).toEqual(false);
    expect(isTaggedId("a1")).toEqual(true);
    // This fails because this test suite is globally configured to use slug ids.
    expect(isTaggedId("a:1")).toEqual(false);
    expect(tagFromId("a1")).toEqual("a");
    expect(tagFromId("foo123")).toEqual("foo");
    expect(tagFromId("foo00123")).toEqual("foo");
    // These are purposefully lax to avoid adding validation to hot ID conversion paths.
    expect(tagId(Author, "-1")).toEqual("a-1");
    expect(tagId(Author, 1.5)).toEqual("a1.5");
    expect(meta.fields.id.serde!.columns[0].mapToDb(1.5)).toEqual(1.5);
    expect(() => tagId(Author, "b1")).toThrow("Invalid tagged id, expected tag a, got b1");
  });
});
