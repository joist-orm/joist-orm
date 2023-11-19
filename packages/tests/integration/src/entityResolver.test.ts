import { GraphQLFileLoader } from "@graphql-tools/graphql-file-loader";
import { loadSchema } from "@graphql-tools/load";
import { Author } from "@src/entities";
import { insertAuthor, insertBook, insertPublisher, update } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { entityResolver } from "joist-graphql-resolver-utils";

describe("entityResolver", () => {
  it("can load derived values without calculating them", async () => {
    // Given an author with a technically incorrect numberOfPublicReviews
    await insertAuthor({ first_name: "a1", number_of_public_reviews: 2 });
    const em = newEntityManager();
    // When we access it via the entity resolver
    const a = await em.load(Author, "a:1");
    const result = entityResolver(Author).numberOfPublicReviews(a, {}, {}, undefined!);
    // Then we got the stale value
    expect(result).toBe(2);
  });

  it("m2o calls populate if selection set", async () => {
    const schema = await loadSchema("./schema/**/*.graphql", { loaders: [new GraphQLFileLoader()] });

    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    // When we access it via the entity resolver
    const a = await em.load(Author, "a:1");
    // And we want the next level of images
    const info = {
      returnType: schema.getType("Publisher"),
      fieldNodes: [
        {
          selectionSet: {
            selections: [{ kind: "Field", name: { value: "images" }, selectionSet: { selections: [] } }],
          },
        },
      ],
    } as any;
    const spy = jest.spyOn(em, "populate");
    const p = await entityResolver(Author).publisher(a, {}, {}, info);
    // Then we didn't need to call populate
    expect(spy).toHaveBeenCalledWith(a, { publisher: { images: {} } });
    expect(p.name).toBe("p1");
  });

  it("m2o does not populate if no selection set", async () => {
    const em = newEntityManager();
    const schema = await loadSchema("./schema/**/*.graphql", { loaders: [new GraphQLFileLoader()] });

    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    // When we access it via the entity resolver
    const a = await em.load(Author, "a:1");
    const info = {
      returnType: schema.getType("Publisher"),
      fieldNodes: [{ selectionSet: { selections: [] } }],
    } as any;
    const spy = jest.spyOn(em, "populate");
    await entityResolver(Author).publisher(a, {}, {}, info);
    // Then we didn't need to call populate
    expect(spy).not.toHaveBeenCalled();
  });

  it("m2o does not call populate if there are arguments", async () => {
    const schema = await loadSchema("./schema/**/*.graphql", { loaders: [new GraphQLFileLoader()] });

    // Given an author with a publisher
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    // When we access it via the entity resolver
    const a = await em.load(Author, "a:1");
    // And we want the next level of images
    const info = {
      returnType: schema.getType("Publisher"),
      fieldNodes: [
        {
          // And there are also some custom arguments like filtering
          arguments: [{ name: { value: "filter" }, value: { kind: "StringValue", value: "p1" } }],
          selectionSet: {
            selections: [{ kind: "Field", name: { value: "images" }, selectionSet: { selections: [] } }],
          },
        },
      ],
    } as any;
    const spy = jest.spyOn(em, "populate");
    const p = await entityResolver(Author).publisher(a, {}, {}, info);
    // Then we didn't need to call populate
    expect(spy).not.toHaveBeenCalled();
  });

  it("derived m2o calls populate if selection set", async () => {
    const em = newEntityManager();
    const schema = await loadSchema("./schema/**/*.graphql", { loaders: [new GraphQLFileLoader()] });

    // Given an author with a favorite book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await update("authors", { id: 1, favorite_book_id: 1 });

    // When we access it via the entity resolver
    const a = await em.load(Author, "a:1");
    // And we want the next level of reviews
    const info = {
      returnType: schema.getType("Book"),
      fieldNodes: [
        {
          selectionSet: {
            selections: [{ kind: "Field", name: { value: "reviews" }, selectionSet: { selections: [] } }],
          },
        },
      ],
    } as any;
    const spy = jest.spyOn(em, "populate");
    const b = await entityResolver(Author).favoriteBook(a, {}, {}, info);
    // Then we called populate
    expect(spy).toHaveBeenCalledWith(a, { favoriteBook: { reviews: {} } });
    expect(b.reviews.isLoaded).toBe(true);
  });
});
