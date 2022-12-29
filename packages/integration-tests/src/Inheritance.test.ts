import { newSmallPublisher } from "./entities";
import { newEntityManager, testDriver } from "./setupDbTests";

describe("Inheritance", () => {
  it("can save a subtype", async () => {
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
});
