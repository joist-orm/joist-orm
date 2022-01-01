import { Author } from "@src/entities/Author";
import { newAuthor } from "@src/entities/Author.factories";
import { knex, newEntityManager } from "@src/setupDbTests";
import { RandomUuidAssigner } from "joist-orm";

describe("Author", () => {
  it("can load an entity with a uuid id", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.find(Author, {});
    expect(a1[0].id).toEqual("a:20000000-0000-0000-0000-000000000000");
  });

  it("can create entities with deterministic uuids", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    await em.flush();
    expect(a1.id).toEqual("a:20000000-0000-0000-0000-000000000000");
  });

  it("can generate random uuids", async () => {
    const em = newEntityManager({ idAssigner: new RandomUuidAssigner() });
    const a1 = newAuthor(em);
    await em.flush();
    expect(a1.id).toEqual("a:20000000-0000-0000-0000-000000000000");
  });
});

let _nextId = 0;

function nextId(): string {
  return `20000000-0000-0000-0000-${String(_nextId++).padStart(12, "0")}`;
}

beforeEach(() => (_nextId = 0));

export async function insertAuthor(row: { first_name: string; last_name?: string | null }) {
  await knex
    .insert({
      id: nextId(),
      created_at: new Date(),
      updated_at: new Date(),
      ...row,
    })
    .into("authors");
}
