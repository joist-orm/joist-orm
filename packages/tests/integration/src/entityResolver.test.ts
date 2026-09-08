import { GraphQLFileLoader } from "@graphql-tools/graphql-file-loader";
import { loadSchema } from "@graphql-tools/load";
import { expectTypeOf } from "expect-type";
import {
  type FieldNode,
  type GraphQLResolveInfo,
  type GraphQLSchema,
  Kind,
  type SelectionNode,
  isOutputType,
} from "graphql";
import { convertInfoToLoadHint, entityResolver } from "joist-graphql-resolver-utils";
import { getMetadata } from "joist-orm";
import {
  Author,
  BookRange,
  Color,
  FavoriteShape,
  ParentGroup,
  Publisher,
  PublisherSize,
  PublisherType,
} from "src/entities";
import { insertAuthor, insertBook, insertParentGroup, insertPublisher, update } from "src/entities/inserts";
import { type Resolver } from "src/generated/graphql-types";
import { newEntityManager } from "src/testEm";

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
    // Given an author with a stored book range
    await insertAuthor({ first_name: "a1", range_of_books: 1 });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    // When the book range and its detail field are resolved
    const resolvers = entityResolver(Author);
    const result = resolvers.rangeOfBooks(a, {}, {}, undefined!);
    const detail = resolvers.rangeOfBooksDetail(a, {}, {}, undefined!);
    // Then both fields return the stored enum code without recalculating it
    expect(result).toBe(BookRange.Few);
    expect(detail).toBe(BookRange.Few);
    expectTypeOf(resolvers.rangeOfBooksDetail).toEqualTypeOf<typeof resolvers.rangeOfBooks>();
  });

  it("resolves required and nullable scalar enum details as enum codes", async () => {
    // Given a publisher with the default Big type and an optional Large size
    await insertPublisher({ name: "p1", size_id: 2 });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    // When the enum fields and their detail fields are resolved
    const resolvers = entityResolver(Publisher);
    // Then each detail field returns the same enum code and preserves nullability
    expect(resolvers.type(p, {}, {}, undefined!)).toBe(PublisherType.Big);
    expect(resolvers.typeDetail(p, {}, {}, undefined!)).toBe(PublisherType.Big);
    expect(resolvers.size(p, {}, {}, undefined!)).toBe(PublisherSize.Large);
    expect(resolvers.sizeDetail(p, {}, {}, undefined!)).toBe(PublisherSize.Large);
    expectTypeOf(resolvers.typeDetail).toEqualTypeOf<typeof resolvers.type>();
    expectTypeOf(resolvers.sizeDetail).toEqualTypeOf<typeof resolvers.size>();
    // @ts-expect-error An optional publisher size cannot back a required GraphQL detail field.
    const requiredSize: Resolver<Publisher, {}, PublisherSize> = resolvers.sizeDetail;
    expect(requiredSize).toBe(resolvers.sizeDetail);
  });

  it("returns undefined for an absent nullable enum detail", async () => {
    // Given a publisher without an optional size
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    // When the size and its detail field are resolved
    const resolvers = entityResolver(Publisher);
    // Then both fields are absent
    expect(resolvers.size(p, {}, {}, undefined!)).toBeUndefined();
    expect(resolvers.sizeDetail(p, {}, {}, undefined!)).toBeUndefined();
  });

  it("does not add detail fields for enum arrays or native PostgreSQL enums", async () => {
    // Given an author with an enum-table color array and a native PostgreSQL shape enum
    await insertAuthor({ first_name: "a1", favorite_colors: [1], favorite_shape: FavoriteShape.Circle });
    const em = newEntityManager();
    const a = await em.load(Author, "a:1");
    // When the author's enum fields are resolved
    const resolvers = entityResolver(Author);
    // Then the existing fields still return their values without detail companions
    expect(resolvers.favoriteColors(a, {}, {}, undefined!)).toEqual([Color.Red]);
    expect(resolvers.favoriteShape(a, {}, {}, undefined!)).toBe(FavoriteShape.Circle);
    // @ts-expect-error Enum arrays do not have scalar detail resolvers.
    expect(resolvers.favoriteColorsDetail).toBeUndefined();
    // @ts-expect-error Native PostgreSQL enums do not have enum-table detail resolvers.
    expect(resolvers.favoriteShapeDetail).toBeUndefined();
  });

  it("lets explicit aliases override generated enum detail fields", async () => {
    // Given a publisher with different type and size codes
    await insertPublisher({ name: "p1", size_id: 2 });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    // And the size detail field is explicitly mapped to the publisher type
    const resolvers = entityResolver(Publisher, { sizeDetail: "type" });
    // When the size detail is resolved
    const detail = resolvers.sizeDetail(p, {}, {}, undefined!);
    // Then the explicit alias takes precedence without changing the size field
    expect(detail).toBe(PublisherType.Big);
    expect(resolvers.size(p, {}, {}, undefined!)).toBe(PublisherSize.Large);
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

  it("loads async properties on demand and returns loaded values synchronously", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const p = await em.load(Publisher, "p:1");
    const resolver = entityResolver(Publisher).numberOfAuthors;

    expect(await resolver(p, {}, {}, undefined!)).toBe(1);
    expect(resolver(p, {}, {}, undefined!)).toBe(1);
  });

  it("loads lazy jsonb fields on demand", async () => {
    // Given a parent group with a `lazy` jsonb column that is excluded from the default SELECT
    await insertParentGroup({ name: "pg1", bulk_data: { a: 1 } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1");
    // When we access the lazy field via the entity resolver
    const result = await entityResolver(ParentGroup).bulkData(pg, {}, {}, undefined!);
    // Then it is fetched and put on the wire
    expect(result).toEqual({ a: 1 });
  });

  it("returns lazy jsonb fields synchronously once loaded", async () => {
    // Given a parent group whose `lazy` column has already been populated
    await insertParentGroup({ name: "pg1", required_data: { b: 2 } });
    const em = newEntityManager();
    const pg = await em.load(ParentGroup, "parentGroup:1", "requiredData");
    // When we access the lazy field via the entity resolver
    const result = entityResolver(ParentGroup).requiredData(pg, {}, {}, undefined!);
    // Then it is returned synchronously from the already-loaded value
    expect(result).toEqual({ b: 2 });
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
