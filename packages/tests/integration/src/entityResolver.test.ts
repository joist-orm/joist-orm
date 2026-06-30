import { GraphQLFileLoader } from "@graphql-tools/graphql-file-loader";
import { loadSchema } from "@graphql-tools/load";
import { Author, BookRange, type Publisher } from "@src/entities";
import { insertAuthor, insertBook, insertPublisher, update } from "@src/entities/inserts";
import { type Resolver } from "@src/generated/graphql-types";
import { newEntityManager } from "@src/testEm";
import {
  type FieldNode,
  type GraphQLResolveInfo,
  type GraphQLSchema,
  isOutputType,
  Kind,
  type SelectionNode,
} from "graphql";
import { convertInfoToLoadHint, entityResolver } from "joist-graphql-resolver-utils";
import { getMetadata } from "joist-orm";

describe("entityResolver", () => {
  let schema: GraphQLSchema;

  beforeAll(async () => {
    schema = await loadSchema("./schema/**/*.graphql", { loaders: [new GraphQLFileLoader()] });
  });

  it("fails type-checking a required GraphQL field backed by a nullable m2o", () => {
    // @ts-expect-error Author.publisher is nullable, so it cannot satisfy a required GraphQL Publisher field.
    const resolvers: { publisher: Resolver<Author, {}, Publisher> } = entityResolver(Author);
    expect(resolvers).toBeDefined();
  });

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

  it("can load derived enums", async () => {
    await insertAuthor({ first_name: "a1", range_of_books: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const result = entityResolver(Author).rangeOfBooks(a, {}, {}, undefined!);
    expect(result).toBe(BookRange.Few);
  });

  it("m2o calls populate if selection set", async () => {
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
    expect(p?.name).toBe("p1");
  });

  it("m2o does not populate if no selection set", async () => {
    const em = newEntityManager();

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

  it("includes nested relations without arguments in load hints", async () => {
    // Given a nested GraphQL selection without arguments, I.e. query { author(id) { books { reviews { rating } } } }
    const info = newResolveInfo(schema, "Author", [field("books", [field("reviews", [field("rating")])])]);

    // When we convert it to a Joist load hint
    // Then we include all nested relations
    expect(convertInfoToLoadHint(getMetadata(Author), info)).toEqual({ books: { reviews: {} } });
  });

  it("excludes nested relations with arguments from load hints", async () => {
    // Given a nested GraphQL selection with arguments, I.e. query { author(id) { books { reviews(first: 5) { rating } } } }
    const info = newResolveInfo(schema, "Author", [field("books", [field("reviews", [field("rating")], ["first"])])]);

    // When we convert it to a Joist load hint
    // Then we exclude the argument-bearing relation
    expect(convertInfoToLoadHint(getMetadata(Author), info)).toEqual({ books: {} });
  });

  it("excludes deeply nested relations with arguments while keeping parent relations in load hints", async () => {
    // Given a deeply nested GraphQL selection with arguments, I.e. query { author(id) { books { reviews { book(first: 5) { title } } } } }
    const info = newResolveInfo(schema, "Author", [
      field("books", [field("reviews", [field("book", [field("title")], ["first"])])]),
    ]);

    // When we convert it to a Joist load hint
    // Then we keep parent relations and exclude the argument-bearing relation
    expect(convertInfoToLoadHint(getMetadata(Author), info)).toEqual({ books: { reviews: {} } });
  });

  it("derived m2o calls populate if selection set", async () => {
    const em = newEntityManager();

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
    expect(b?.reviews.isLoaded).toBe(true);
  });

  it("can load recursive relations", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2", mentor_id: 1 });
    await insertAuthor({ first_name: "a3", mentor_id: 2 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:3");
    const result = await entityResolver(Author).mentorsRecursive(a, {}, {}, undefined!);
    expect(result).toMatchEntity([{ id: "a:2" }, { id: "a:1" }]);
  });

  it("can load enum getter methods", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    const result = await entityResolver(Author).isRed(a, {}, {}, undefined!);
    expect(result).toBe(false);
  });
});

/** Creates a minimal GraphQL resolve info for testing load hint conversion. */
function newResolveInfo(
  schema: GraphQLSchema,
  returnTypeName: string,
  selections: SelectionNode[],
): GraphQLResolveInfo {
  const returnType = schema.getType(returnTypeName);
  if (returnType === undefined || !isOutputType(returnType)) {
    throw new Error(`No GraphQL type named ${returnTypeName}`);
  }
  return {
    schema,
    returnType,
    fieldNodes: [{ kind: Kind.FIELD, selectionSet: { kind: Kind.SELECTION_SET, selections } }],
  } as unknown as GraphQLResolveInfo;
}

/** Creates a minimal GraphQL field AST node for testing load hint conversion. */
function field(name: string, selections?: SelectionNode[], args?: string[]): FieldNode {
  return {
    kind: Kind.FIELD,
    name: { kind: Kind.NAME, value: name },
    arguments: args?.map((arg) => ({
      kind: Kind.ARGUMENT,
      name: { kind: Kind.NAME, value: arg },
      value: { kind: Kind.INT, value: "1" },
    })),
    selectionSet: selections ? { kind: Kind.SELECTION_SET, selections } : undefined,
  };
}
