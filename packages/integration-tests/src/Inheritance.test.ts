import { insertLargePublisher, insertPublisher, insertSmallPublisher } from "@src/entities/inserts";
import { LargePublisher, newSmallPublisher, Publisher, SmallPublisher } from "./entities";
import { newEntityManager, testDriver } from "./setupDbTests";

describe("Inheritance", () => {
  it("can save a subtype into two tables", async () => {
    const em = newEntityManager();
    newSmallPublisher(em, { name: "sp1" });
    await em.flush();
    expect(await testDriver.select("publishers")).toMatchObject([
      {
        id: 1,
        huge_number: null,
        latitude: null,
        longitude: null,
        name: "sp1",
        size_id: null,
        tag_id: null,
        type_id: 1,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    ]);
    expect(await testDriver.select("small_publishers")).toMatchObject([
      {
        id: 1,
        city: "city",
      },
    ]);
  });

  it("can load a subtype from separate tables", async () => {
    await insertPublisher({ name: "sp1" });
    await insertSmallPublisher({ id: 1, city: "city" });
    await insertPublisher({ name: "lp2" });
    await insertLargePublisher({ id: 2, country: "country" });

    const em = newEntityManager();
    const sp = await em.load(Publisher, "p:1");
    expect(sp).toBeInstanceOf(SmallPublisher);
    expect(sp).toMatchEntity({ city: "city" });

    const lp = await em.load(Publisher, "p:2");
    expect(lp).toBeInstanceOf(LargePublisher);
  });
});
