import { Entity, EntityManager } from "joist-orm";
import { knex } from "./setupDbTests";
import { Author, Book, Publisher } from "./entities";

describe("EntityManager.lens", () => {
  it("can navigate", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");
    const em = new EntityManager(knex);
    const book = await em.load(Book, "1");
    const p1 = await get(book, (b) => b.author.publisher);
    expect(p1.name).toEqual("p1");
  });
});

async function get<T extends Entity, RLens extends { __type: any }>(
  entity: T,
  fn: (lens: BookLens) => RLens,
): Promise<LensEntityType<RLens>> {
  return null!;
}

type LensEntityType<L> = L extends { __type: infer U } ? U : never;

interface BookLens {
  __type: Book;
  author: AuthorLens;
}

interface AuthorLens {
  __type: Author;
  publisher: PublisherLens;
}

interface PublisherLens {
  __type: Publisher;
}
