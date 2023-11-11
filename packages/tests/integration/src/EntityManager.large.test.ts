import { insertTag } from "@src/entities/inserts";
import { zeroTo } from "@src/utils";
import { Tag, newPublisher } from "./entities";

import { newEntityManager } from "@src/testEm";

jest.setTimeout(30_000);

describe.skip("EntityManager.large", () => {
  it("can insert 10k records", async () => {
    const em = newEntityManager();
    zeroTo(10_000).forEach(() => newPublisher(em));
    await em.flush();
  });

  it("can update 10k records", async () => {
    await Promise.all(zeroTo(10_000).map((i) => insertTag({ name: `t${i}` })));
    const em = newEntityManager();
    const tags = await em.find(Tag, {});
    tags.forEach((t, i) => {
      t.name = `t${i} updated`;
    });
    await em.flush();
  });
});
