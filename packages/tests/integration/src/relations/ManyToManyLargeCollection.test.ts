import { Author, newAuthor, newTag, Tag } from "@src/entities";
import { insertAuthor, insertAuthorToTag, insertTag } from "@src/entities/inserts";

import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";

describe("ManyToManyLargeCollection", () => {
  it("can percolate large to regular", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const t1 = newTag(em, 1);
    // Given we've added the author to the tag
    t1.authors.add(a1);
    // Then the tag sees it
    expect(a1.tags.get.includes(t1)).toEqual(true);
    // And when we remove it
    t1.authors.remove(a1);
    // Then the author no longer sees it
    expect(a1.tags.get.includes(t1)).toEqual(false);
  });

  it("can percolate regular to large", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const t1 = newTag(em, 1);
    // Given we've added the tag to the author
    a1.tags.add(t1);
    // Then the tag sees it
    expect(await t1.authors.includes(a1)).toEqual(true);
    // And when we remove it
    a1.tags.remove(t1);
    // Then the tag no longer sees it
    expect(await t1.authors.includes(a1)).toEqual(false);
  });

  it("can include on a new entity", async () => {
    // Given an existing author
    const em = newEntityManager();
    await insertAuthor({ first_name: `a1` });
    const a1 = await em.load(Author, "a:1");
    resetQueryCount();
    // And a new tag
    const t1 = newTag(em, 1);
    // When we ask the new tag if it has the author
    const includes = await t1.authors.includes(a1);
    // Then it does not
    expect(includes).toBe(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on a new other entity", async () => {
    // Given an existing tag
    const em = newEntityManager();
    await insertTag({ name: `t1` });
    const tag = await em.load(Tag, "t:1");
    resetQueryCount();
    // And a new author
    const author = newAuthor(em);
    // When we ask the tag if it has the author
    const includes = await tag.authors.includes(author);
    // Then it does not
    expect(includes).toBe(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on existing entities", async () => {
    // Given lots of tags and authors
    const em = newEntityManager();
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertAuthor({ first_name: "a1" });
    // And t1 has just a1
    await insertAuthorToTag({ tag_id: 1, author_id: 1 });
    const t1 = await em.load(Tag, "t:1");
    const t2 = await em.load(Tag, "t:2");
    const a1 = await em.load(Author, "a:1");
    resetQueryCount();
    // When we ask each other if they include each other
    const p1 = t1.authors.includes(a1);
    const p2 = t2.authors.includes(a1);
    const p3 = a1.tags.includes(t1);
    const p4 = a1.tags.includes(t2);
    const [i1, i2, i3, i4] = await Promise.all([p1, p2, p3, p4]);
    // Then they do
    expect(i1).toBe(true);
    expect(i2).toBe(false);
    expect(i3).toBe(true);
    expect(i4).toBe(false);
    // And we used only a single query
    expect(numberOfQueries).toEqual(1);
    // And we did not load the other tags
    expect(em.entities.length).toEqual(3);
    // And if we redo a .includes
    const i1_2 = await t1.authors.includes(a1);
    // Then it was cached
    expect(i1_2).toBe(true);
    expect(numberOfQueries).toEqual(1);
  });

  it("can include just added entities on new entities", async () => {
    // Given a new author and tag
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const t1 = newTag(em, 1);
    // And we've added them together in-memory
    a1.tags.add(t1);
    // Then we can answer includes
    const p1 = t1.authors.includes(a1);
    const p2 = a1.tags.includes(t1);
    const [i1, i2] = await Promise.all([p1, p2]);
    expect(i1).toBe(true);
    expect(i2).toBe(true);
    // And we did not make any db queries
    expect(numberOfQueries).toEqual(0);
  });

  it("can include just added entities on existing entities", async () => {
    // Given an existing author and tag
    const em = newEntityManager();
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertAuthor({ first_name: "a1" });
    resetQueryCount();
    const a1 = await em.load(Author, "a:1");
    const [t1, t2] = await em.loadAll(Tag, ["t:1", "t:2"]);
    // And we've added them together in-memory
    a1.tags.add(t1);
    // Then we can answer includes
    const p1 = t1.authors.includes(a1);
    const p2 = t2.authors.includes(a1);
    const p3 = a1.tags.includes(t1);
    const p4 = a1.tags.includes(t2);
    const [i1, i2, i3, i4] = await Promise.all([p1, p2, p3, p4]);
    expect(i1).toBe(true);
    expect(i2).toBe(false);
    expect(i3).toBe(true);
    expect(i4).toBe(false);
  });
});
