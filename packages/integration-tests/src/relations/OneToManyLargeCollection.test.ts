import { newPublisher, newTag, Publisher, Tag } from "@src/entities";
import { insertPublisher, insertTag, select } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/setupDbTests";
import { LoadHint } from "joist-orm";

describe("OneToManyLargeCollection", () => {
  it("can percolate large to entity", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    const t1 = newTag(em, 1);
    // Given we've added the publisher to the tag
    t1.publishers.add(p1);
    // Then the publisher sees it
    expect(p1.tag.get).toEqual(t1);
    // And when we remove it
    t1.publishers.remove(p1);
    // Then the publisher no longer sees it
    expect(p1.tag.get).toBeUndefined();
  });

  it("can percolate entity to large", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    const t1 = newTag(em, 1);
    // Given we've added the tag to the publisher
    p1.tag.set(t1);
    // Then the tag sees it
    expect(await t1.publishers.includes(p1)).toEqual(true);
    // And when we remove it
    p1.tag.set(undefined);
    // Then the tag no longer sees it
    expect(await t1.publishers.includes(p1)).toEqual(false);
  });

  it("cannot be a load hint", async () => {
    // ...actually this does work, b/c Tag doesn't have any other loadable collections,
    // so NestedLoadHint becomes {}, and turns out anything extends {}...
    const hint: LoadHint<Tag> = { publishers: {} };
  });

  it("does not break the m2o side factory", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em, { tag: 1 });
    await em.flush();
    const tag = p1.tag.get!;
    expect(tag.name).toEqual("1");
  });

  it("does not allow creating via the lo2m side factory", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    const tag = newTag(em, { publishers: [{}, {}] });
    await em.flush();
    const rows = await select("publishers");
    expect(rows.length).toEqual(0);
  });

  it("can include on a new entity", async () => {
    // Given an existing publisher
    const em = newEntityManager();
    await insertPublisher({ name: "p1" });
    const p1 = await em.load(Publisher, "p:1");
    resetQueryCount();
    // And a new tag
    const t1 = newTag(em, 1);
    // When we ask the tag if it has the publisher
    const includes = await t1.publishers.includes(p1);
    // Then it does not
    expect(includes).toEqual(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on an existing entity", async () => {
    const em = newEntityManager();
    // Given two existing tags
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    // And one existing publisher
    await insertPublisher({ name: "p1", tag_id: 1 });
    const [t1, t2] = await em.loadAll(Tag, ["t:1", "t:2"]);
    const p1 = await em.load(Publisher, "p:1");
    resetQueryCount();
    // When we ask tags if they have the publisher
    const [i1, i2] = await Promise.all([t1.publishers.includes(p1), t2.publishers.includes(p1)]);
    // Then the 1st does, the 2nd does not
    expect(i1).toEqual(true);
    expect(i2).toEqual(false);
    // And we didn't make any queries
    expect(numberOfQueries).toEqual(0);
  });

  it("can find on a new entity", async () => {
    // Given an existing publisher
    const em = newEntityManager();
    await insertPublisher({ name: "p1" });
    resetQueryCount();
    // And a new tag
    const tag = newTag(em, 1);
    // When we ask the tag if it has the publisher
    const p1 = await tag.publishers.find("p:1");
    // Then it does not
    expect(p1).toBeUndefined();
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can find on existing entities", async () => {
    // Given several countries with many publishers
    const em = newEntityManager();
    await insertTag({ name: "t1" });
    await insertPublisher({ name: "p1", tag_id: 1 });
    await insertTag({ name: "t2" });
    await insertPublisher({ name: "p2", tag_id: 2 });
    await insertPublisher({ name: "p3", tag_id: 2 });
    const t1 = await em.load(Tag, "t:1");
    const t2 = await em.load(Tag, "t:2");
    resetQueryCount();
    // When we ask each tag if it has a specific publisher
    const [p1, p2, p3] = await Promise.all([
      t1.publishers.find("p:1"),
      t1.publishers.find("p:2"),
      t2.publishers.find("p:2"),
    ]);
    // Then they do
    expect(p1).toBeInstanceOf(Publisher);
    expect(p2).toBeUndefined();
    expect(p3).toBeInstanceOf(Publisher);
    // And we used only a single query
    expect(numberOfQueries).toEqual(1);
    // And we did not load the other publishers
    expect(em.entities.length).toEqual(4);
    // And if we redo the find
    const p1_2 = await t1.publishers.find("p:1");
    // Then it was cached
    expect(p1_2).toEqual(p1);
    expect(numberOfQueries).toEqual(1);
  });

  it("can find just added entities on new entities", async () => {
    // Given an existing publisher
    const em = newEntityManager();
    const p1 = newPublisher(em);
    await em.flush();
    resetQueryCount();
    // When we make a new tag
    const tag = newTag(em, 1);
    // And we put the publisher in it
    p1.tag.set(tag);
    // Then we can answer find
    const p1_2 = await tag.publishers.find(p1.idOrFail);
    expect(p1_2).toEqual(p1);
    // And we did not make any db queries
    expect(numberOfQueries).toEqual(0);
  });
});
