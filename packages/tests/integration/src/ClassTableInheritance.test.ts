import { getProperties } from "joist-orm";
import { newLargePublisher, newSmallPublisher, SmallPublisher } from "src/entities";
import { select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("ClassTableInheritance", () => {
  it("reports the right properties", () => {
    // And does not include the recursive selfReferential field which is configured to be skipped
    expect(Object.keys(getProperties(SmallPublisher.metadata))).toMatchEntity([
      "allImages",
      "commentParentInfo",
      "beforeFlushRan",
      "beforeCreateRan",
      "beforeUpdateRan",
      "beforeDeleteRan",
      "afterValidationRan",
      "afterCommitRan",
      "smallPublishers",
      "users",
      "selfReferential",
      "sizeDetails",
      "isSizeSmall",
      "isSizeLarge",
      "typeDetails",
      "isTypeSmall",
      "isTypeBig",
      "authors",
      "bookAdvances",
      "comments",
      "images",
      "group",
      "tags",
      "tasks",
    ]);
  });

  it("setDefaults work as expected for subtypes", async () => {
    const em = newEntityManager();
    const sp = newSmallPublisher(em, {});
    const lp = newLargePublisher(em, {});
    await em.flush();

    const publishers = await select("publishers");
    expect(publishers.length).toEqual(2);
    // Then SmallPublisher persisted its defaults from the base class
    expect(publishers[0].id).toEqual(parseInt(sp.idUntagged));
    expect(publishers[0].base_sync_default).toEqual("BaseSyncDefault");
    expect(publishers[0].base_async_default).toEqual("BaseAsyncDefault");
    // And LargePublisher overrode the base class defaults and persisted its defaults
    expect(publishers[1].id).toEqual(parseInt(lp.idUntagged));
    expect(publishers[1].base_async_default).toEqual("LPAsyncDefault");
    expect(publishers[1].base_sync_default).toEqual("LPSyncDefault");

    // And the entities reflect the values
    expect(sp).toMatchEntity({
      baseSyncDefault: "BaseSyncDefault",
      baseAsyncDefault: "BaseAsyncDefault",
    });
    expect(lp).toMatchEntity({
      baseSyncDefault: "LPSyncDefault",
      baseAsyncDefault: "LPAsyncDefault",
    });
  });
});
