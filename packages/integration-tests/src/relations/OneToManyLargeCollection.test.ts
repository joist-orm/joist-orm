import { Critic, newCritic, newPublisherGroup, newTag, Publisher, PublisherGroup } from "@src/entities";
import { insertCritic, insertPublisher, insertPublisherGroup, select } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/setupDbTests";
import { LoadHint } from "joist-orm";

describe("OneToManyLargeCollection", () => {
  it("can percolate large to entity", async () => {
    const em = newEntityManager();
    const pg1 = newPublisherGroup(em);
    const c1 = newCritic(em, { group: pg1 });
    // Given we've added the group
    pg1.critics.add(c1);
    // Then the critic sees it
    expect(c1.group.get).toEqual(pg1);
    // And when we remove it
    pg1.critics.remove(c1);
    // Then the critic no longer sees it
    expect(c1.group.get).toBeUndefined();
  });

  it("can percolate entity to large", async () => {
    const em = newEntityManager();
    const pg1 = newPublisherGroup(em);
    const c1 = newCritic(em);
    // Given we've set the group
    c1.group.set(pg1);
    // Then the o2m sees it
    expect(await pg1.critics.includes(c1)).toEqual(true);
    // And when we remove it
    c1.group.set(undefined);
    // Then the tag no longer sees it
    expect(await pg1.critics.includes(c1)).toEqual(false);
  });

  it("cannot be a load hint", async () => {
    // @ts-expect-error
    const hint: LoadHint<PublisherGroup> = { critics: {} };
  });

  it("does not break the m2o side factory", async () => {
    const em = newEntityManager();
    const c1 = newCritic(em, { group: {} });
    await em.flush();
    const group = c1.group.get!;
    expect(group.name).toEqual("name");
  });

  it("does not allow creating via the lo2m side factory", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    const group = newPublisherGroup(em, { critics: [{}, {}] });
    await em.flush();
    const rows = await select("critics");
    expect(rows.length).toEqual(0);
  });

  it("can include on a new entity", async () => {
    // Given an existing publisher
    const em = newEntityManager();
    await insertPublisher({ name: "c1" });
    const c1 = await em.load(Publisher, "p:1");
    resetQueryCount();
    // And a new tag
    const pg1 = newTag(em, 1);
    // When we ask the tag if it has the publisher
    const includes = await pg1.publishers.includes(c1);
    // Then it does not
    expect(includes).toEqual(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on an existing entity", async () => {
    const em = newEntityManager();
    // Given two existing groups
    await insertPublisherGroup({ name: "pg1" });
    await insertPublisherGroup({ name: "pg2" });
    // And one existing critic
    await insertCritic({ name: "c1", group_id: 1 });
    const [pg1, pg2] = await em.loadAll(PublisherGroup, ["pg:1", "pg:2"]);
    const c1 = await em.load(Critic, "c:1");
    resetQueryCount();
    // When we ask groups if they have the critic
    const [i1, i2] = await Promise.all([pg1.critics.includes(c1), pg2.critics.includes(c1)]);
    // Then the 1st does, the 2nd does not
    expect(i1).toEqual(true);
    expect(i2).toEqual(false);
    // And we didn't make any queries
    expect(numberOfQueries).toEqual(0);
  });

  it("can find on a new entity", async () => {
    // Given an existing critic
    const em = newEntityManager();
    await insertCritic({ name: "c1" });
    resetQueryCount();
    // And a new group
    const pg = newPublisherGroup(em);
    // When we ask the tag if it has the publisher
    const c1 = await pg.critics.find("c:1");
    // Then it does not
    expect(c1).toBeUndefined();
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can find on existing entities", async () => {
    // Given several groups with many critics
    const em = newEntityManager();
    await insertPublisherGroup({ name: "pg1" });
    await insertCritic({ name: "c1", group_id: 1 });
    await insertPublisherGroup({ name: "pg2" });
    await insertCritic({ name: "p2", group_id: 2 });
    await insertCritic({ name: "p3", group_id: 2 });
    const pg1 = await em.load(PublisherGroup, "pg:1");
    const pg2 = await em.load(PublisherGroup, "pg:2");
    resetQueryCount();
    // When we ask each tag if it has a specific publisher
    const [c1, c2, c3] = await Promise.all([pg1.critics.find("c:1"), pg1.critics.find("c:2"), pg2.critics.find("c:2")]);
    // Then they do
    expect(c1).toBeInstanceOf(Critic);
    expect(c2).toBeUndefined();
    expect(c3).toBeInstanceOf(Critic);
    // And we used only a single query
    expect(numberOfQueries).toEqual(1);
    // And we did not load the other publishers
    expect(em.entities.length).toEqual(4);
    // And if we redo the find
    const pg1_2 = await pg1.critics.find("c:1");
    // Then it was cached
    expect(pg1_2).toEqual(c1);
    expect(numberOfQueries).toEqual(1);
  });

  it("can find just added entities on new entities", async () => {
    // Given an existing critic
    const em = newEntityManager();
    const c1 = newCritic(em);
    await em.flush();
    resetQueryCount();
    // When we make a new group
    const pg = newPublisherGroup(em);
    // And we put the critic in it
    c1.group.set(pg);
    // Then we can answer find
    const c1_2 = await pg.critics.find(c1.idOrFail);
    expect(c1_2).toEqual(c1);
    // And we did not make any db queries
    expect(numberOfQueries).toEqual(0);
  });
});
