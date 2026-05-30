import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { dateCode, plainDateCode, plainDateTimeCode, zonedDateTimeCode } from "joist-codegen/build/utils";
import { keyBy } from "joist-utils";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles";
import {
  newEntityMetadata,
  newEnumField,
  newFs,
  newManyToOneField,
  newPolymorphicField,
  newPrimitiveField,
} from "./testUtils";
import { Fs } from "./utils";

describe("generateGraphqlSchemaFiles", () => {
  it("creates a new file", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    // And no existing graphql file
    const fs = newFs({});
    // When ran
    await generate(fs, entities);
    // We now have a graphql file
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
     }

     input AuthorFilter {
       id: ID
     }

     input SaveAuthorInput {
       id: ID
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
    expect(await fs.load("pageInfo.graphql")).toMatchInlineSnapshot(`
      "type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        totalCount: Int!
        startCursor: String
        endCursor: String
      }
      "
    `);
  });

  it("generates cursor query fields by default", async () => {
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const fs = newFs({});
    await generate(fs, entities);
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
     }

     input AuthorFilter {
       id: ID
     }

     input SaveAuthorInput {
       id: ID
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("generates limit query fields", async () => {
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const fs = newFs({});
    await generate(fs, entities, { paginationStyle: "limit" });
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, limit: Int, offset: Int): AuthorsPage!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsPage {
       entities: [Author!]!
       pageInfo: PageInfo!
     }

     type Author {
       id: ID!
     }

     input AuthorFilter {
       id: ID
     }

     input SaveAuthorInput {
       id: ID
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
    expect(await fs.load("pageInfo.graphql")).toMatchInlineSnapshot(`
      "type PageInfo {
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        totalCount: Int!
        nextPage: Int
        currentPage: Int
      }
      "
    `);
  });

  it("generates filter fields", async () => {
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Publisher"),
      newEntityMetadata("Book"),
      newEntityMetadata("Author", {
        primitives: [
          newPrimitiveField("firstName"),
          newPrimitiveField("nickNames", { isArray: true }),
          newPrimitiveField("numberOfAtoms", { columnType: "bigint", fieldType: "bigint", rawFieldType: "bigint" }),
        ],
        enums: [newEnumField("color")],
        manyToOnes: [newManyToOneField("publisher", "Publisher")],
        polymorphics: [newPolymorphicField("favorite", ["Book", "Publisher"])],
      }),
    ];
    const fs = newFs({});
    await generate(fs, entities);
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       firstName: String!
       nickNames: [String!]!
       numberOfAtoms: BigInt!
       color: ColorDetail!
       publisher: Publisher!
       favorite: FavoriteParent
     }

     input AuthorFilter {
       id: ID
       firstName: String
       nickNames: [String!]
       numberOfAtoms: BigInt
       color: Color
       publisherId: ID
       favoriteId: ID
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
       nickNames: [String!]
       numberOfAtoms: BigInt
       color: Color
       publisherId: ID
       favoriteId: ID
     }

     type SaveAuthorResult {
       author: Author!
     }

     union FavoriteParent = Book | Publisher
     "
    `);
  });

  it("adds a new field to existing file", async () => {
    // Given an author with a primitive field
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [newPrimitiveField("firstName")],
      }),
    ];
    // And an existing graphql file
    const fs = newFs({
      "author.graphql": "type Author { id: ID! } input SaveAuthorInput { id: ID }",
      // And the history file doesn't have firstName yet
      ".history.json": JSON.stringify({ Author: ["id"] }),
    });
    // When ran
    await generate(fs, entities);
    // Then we added the new field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type Author {
       id: ID!
       firstName: String!
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     input AuthorFilter {
       id: ID
       firstName: String
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
    // And saved it in the history
    expect(JSON.parse((await fs.load(".history.json")) || "")).toMatchInlineSnapshot(`
     {
       "Author": [
         "firstName",
         "id",
       ],
       "AuthorFilter": [
         "firstName",
         "id",
       ],
       "AuthorsConnection": [
         "edges",
         "nodes",
         "pageInfo",
       ],
       "AuthorsEdge": [
         "cursor",
         "node",
       ],
       "Mutation": [
         "saveAuthor",
       ],
       "PageInfo": [
         "endCursor",
         "hasNextPage",
         "hasPreviousPage",
         "startCursor",
         "totalCount",
       ],
       "Query": [
         "author",
         "authors",
       ],
       "SaveAuthorInput": [
         "firstName",
         "id",
       ],
       "SaveAuthorResult": [
         "author",
       ],
     }
    `);
  });

  it("does not overwrite existing fields", async () => {
    // Given an author with a primitive field
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [newPrimitiveField("firstName")],
      }),
    ];
    // And an existing graphql file with a custom field
    const fs = newFs({
      "author.graphql":
        "type Author { id: ID! customField: String } input SaveAuthorInput { id: ID customField: String }",
    });
    // When ran
    await generate(fs, entities);
    // We added the new field, but did not did the custom field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type Author {
       id: ID!
       customField: String
       firstName: String!
     }

     input SaveAuthorInput {
       id: ID
       customField: String
       firstName: String
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     input AuthorFilter {
       id: ID
       firstName: String
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("does not re-add fields from existing type extensions", async () => {
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const fs = newFs({
      "author.graphql": "extend type Query { authors: [Author!]! author(id: ID!): Author } type Author { id: ID! }",
    });

    await generate(fs, entities);

    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       authors: [Author!]!
       author(id: ID!): Author
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type Author {
       id: ID!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     input AuthorFilter {
       id: ID
     }

     input SaveAuthorInput {
       id: ID
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("does not re-add fields in the history file", async () => {
    // Given an author with a firstName field
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [newPrimitiveField("firstName")],
      }),
    ];
    const fs = newFs({
      // And an existing graphql file without the firstName
      "author.graphql": "type Author { id: ID! }",
      // And the history file said we've already added it
      ".history.json": JSON.stringify({ Author: ["firstName"] }),
    });
    // When ran
    await generate(fs, entities);
    // Then we did not re-add it as a new field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type Author {
       id: ID!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     input AuthorFilter {
       id: ID
       firstName: String
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("keeps comments", async () => {
    // Given an author with a primitive field
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [newPrimitiveField("firstName")],
      }),
    ];
    // And an existing graphql file
    const fs = newFs({
      "author.graphql": `
        " The author. "
        type Author { " The id. " id: ID! }
        input SaveAuthorInput { id: ID }
      `,
    });
    // When ran
    await generate(fs, entities);
    // Then we added the new field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     " The author. "
     type Author {
       " The id. "
       id: ID!
       firstName: String!
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     input AuthorFilter {
       id: ID
       firstName: String
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("does not add derived fields to inputs", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [
          // With a regular field
          newPrimitiveField("firstName"),
          // And also a derived field
          newPrimitiveField("createdAt", { derived: "orm" }),
        ],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the input does not have the createdAt field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       firstName: String!
       createdAt: String!
     }

     input AuthorFilter {
       id: ID
       firstName: String
       createdAt: String
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("can output both Date and DateTime types for Temporal types", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [
          // With a regular field
          newPrimitiveField("firstName"),
          // And a timestamp with time zone field
          newPrimitiveField("createdAt", { fieldType: zonedDateTimeCode }),
          // And a timestamp without time zone field
          newPrimitiveField("startTime", { fieldType: plainDateTimeCode }),
          // And also a date field
          newPrimitiveField("startDate", { fieldType: plainDateCode }),
        ],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the input has both types of fields as appropriate
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       firstName: String!
       createdAt: DateTime!
       startTime: DateTime!
       startDate: Date!
     }

     input AuthorFilter {
       id: ID
       firstName: String
       createdAt: DateTime
       startTime: DateTime
       startDate: Date
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
       createdAt: DateTime
       startTime: DateTime
       startDate: Date
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("can output both Date and DateTime types for legacy Date fields", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [
          // With a regular field
          newPrimitiveField("firstName"),
          // And a timestamp field  with the `_at` convention
          newPrimitiveField("createdAt", { fieldType: dateCode }),
          // And also a date field with the `_date` convention
          newPrimitiveField("startDate", { fieldType: dateCode }),
        ],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the Author links to a PublisherLike
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       firstName: String!
       createdAt: DateTime!
       startDate: Date!
     }

     input AuthorFilter {
       id: ID
       firstName: String
       createdAt: DateTime
       startDate: Date
     }

     input SaveAuthorInput {
       id: ID
       firstName: String
       createdAt: DateTime
       startDate: Date
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("adds enum details", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        // With an enum array field
        enums: [newEnumField("color")],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the input has both types of fields as appropriate
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       color: ColorDetail!
     }

     input AuthorFilter {
       id: ID
       color: Color
     }

     input SaveAuthorInput {
       id: ID
       color: Color
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("can enum array types", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        // With an enum array field
        enums: [newEnumField("color", { isArray: true })],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the input has both types of fields as appropriate
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       color: [Color!]!
     }

     input AuthorFilter {
       id: ID
       color: [Color!]
     }

     input SaveAuthorInput {
       id: ID
       color: [Color!]
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });

  it("adds inherited fields", async () => {
    // Given a small publisher which inherits from publisher
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Publisher", {
        primitives: [newPrimitiveField("name")],
      }),
      newEntityMetadata("SmallPublisher", {
        baseClassName: "Publisher",
        primitives: [newPrimitiveField("city")],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the input has both types of fields as appropriate
    expect(await fs.load("smallPublisher.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       smallPublisher(id: ID!): SmallPublisher!
       smallPublishers(
         filter: SmallPublisherFilter
         first: Int
         after: String
         last: Int
         before: String
       ): SmallPublishersConnection!
     }

     extend type Mutation {
       saveSmallPublisher(input: SaveSmallPublisherInput!): SaveSmallPublisherResult!
     }

     type SmallPublishersConnection {
       edges: [SmallPublishersEdge!]!
       nodes: [SmallPublisher!]!
       pageInfo: PageInfo!
     }

     type SmallPublishersEdge {
       node: SmallPublisher!
       cursor: String!
     }

     type SmallPublisher {
       id: ID!
       name: String!
       city: String!
     }

     input SmallPublisherFilter {
       id: ID
       name: String
       city: String
     }

     input SaveSmallPublisherInput {
       id: ID
       name: String
       city: String
     }

     type SaveSmallPublisherResult {
       smallPublisher: SmallPublisher!
     }
     "
    `);
  });

  it("assumes a Like interface for subclassed & concrete base types", async () => {
    // Given a small publisher which inherits from publisher
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Publisher", {
        primitives: [newPrimitiveField("name")],
      }),
      newEntityMetadata("SmallPublisher", {
        baseClassName: "Publisher",
        primitives: [newPrimitiveField("city")],
      }),
      newEntityMetadata("Author", {
        manyToOnes: [newManyToOneField("publisher", "Publisher")],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generate(fs, entities);
    // Then the input has both types of fields as appropriate
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
     "extend type Query {
       author(id: ID!): Author!
       authors(filter: AuthorFilter, first: Int, after: String, last: Int, before: String): AuthorsConnection!
     }

     extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type AuthorsConnection {
       edges: [AuthorsEdge!]!
       nodes: [Author!]!
       pageInfo: PageInfo!
     }

     type AuthorsEdge {
       node: Author!
       cursor: String!
     }

     type Author {
       id: ID!
       publisher: PublisherLike!
     }

     input AuthorFilter {
       id: ID
       publisherId: ID
     }

     input SaveAuthorInput {
       id: ID
       publisherId: ID
     }

     type SaveAuthorResult {
       author: Author!
     }
     "
    `);
  });
});

async function generate(fs: Fs, opt: EntityDbMetadata[] | Partial<DbMetadata>, config: Partial<Config> = {}) {
  const entities = Array.isArray(opt) ? opt : (opt.entities ?? []);
  const entitiesByName = keyBy(entities, "name");

  // Hook up baseType/subTypes
  for (const entity of entities) {
    if (entity.baseClassName) {
      const baseType = entitiesByName[entity.baseClassName];
      entity.baseType = baseType;
      baseType.subTypes.push(entity);
    }
  }

  const dbMeta = {
    entities,
    enums: {},
    pgEnums: {},
    joinTables: [],
    otherTables: [],
    totalTables: 10,
    entitiesByName,
  } satisfies DbMetadata;
  return generateGraphqlSchemaFiles(config as Config, fs, dbMeta);
}
