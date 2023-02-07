import { LargePublisher } from "./LargePublisher";
import { newLargePublisher } from "./LargePublisher.factories";
import { newPublisherGroup } from "./PublisherGroup.factories";
import { newSmallPublisher } from "./SmallPublisher.factories";

describe("LargePublisher", () => {
  it.withCtx("can be find by inherited fields", async (ctx) => {
    const { em } = ctx;
    // Given a large publisher, a small publisher and a group of publishers
    const lp = newLargePublisher(em, { name: "lp", latitude: 1, country: "US" });
    await em.flush();
    // When we find it by name
    const result = await em.findOneOrFail(LargePublisher, { name: "lp", latitude: 1, country: "US" });
    // Then we get the large publisher
    expect(result).toEqual(lp);
  });
});
