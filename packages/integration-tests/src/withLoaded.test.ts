import { newAuthor } from "@src/entities";
import { newEntityManager } from "@src/setupDbTests";
import { withLoaded } from "joist-orm/build/src/withLoaded";

describe("withLoaded", () => {
  it("with a m2o", async () => {
    const em = newEntityManager();
    const author = newAuthor(em, { publisher: {} });
    const { publisher } = withLoaded(author);
    expect(publisher?.name).toEqual("Publisher 1");
  });
});
