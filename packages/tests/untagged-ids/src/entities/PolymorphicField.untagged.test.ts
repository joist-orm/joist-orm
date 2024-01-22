import { newEntityManager } from "@src/setupDbTests";
import { Comment, newBook, newComment } from "./entities";

describe("Comment", () => {
  it("can find against untagged poly instances", async () => {
    const em = newEntityManager();
    const b = newBook(em);
    newComment(em, { parent: b });
    await em.flush();
    await em.find(Comment, { parent: b });
  });

  it("can find against tagged poly ids", async () => {
    const em = newEntityManager();
    const b = newBook(em);
    newComment(em, { parent: b });
    await em.flush();
    await em.find(Comment, { parent: b.idTagged });
  });

  it("can find against new instances", async () => {
    const em = newEntityManager();
    const b = newBook(em);
    newComment(em, { parent: b });
    await em.find(Comment, { parent: b });
  });
});
