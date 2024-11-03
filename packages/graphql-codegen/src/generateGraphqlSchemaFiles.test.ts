import { DbMetadata, EntityDbMetadata } from "joist-codegen";
import { dateCode, plainDateCode, plainDateTimeCode, zonedDateTimeCode } from "joist-codegen/build/utils";
import { keyBy } from "joist-utils";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles";
import { newEntityMetadata, newEnumField, newFs, newManyToOneField, newPrimitiveField } from "./testUtils";
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
      "extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
      }
      
      type Author {
        id: ID!
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
      "type Author {
        id: ID!
        firstName: String!
      }

      input SaveAuthorInput {
        id: ID
        firstName: String
      }

      extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
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
        "Mutation": [
          "saveAuthor",
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
      "type Author {
        id: ID!
        customField: String
        firstName: String!
      }

      input SaveAuthorInput {
        id: ID
        customField: String
        firstName: String
      }

      extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
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
      "type Author {
        id: ID!
      }

      extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
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
      "" The author. "
      type Author {
        " The id. "
        id: ID!
        firstName: String!
      }

      input SaveAuthorInput {
        id: ID
        firstName: String
      }

      extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
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
      "extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
      }

      type Author {
        id: ID!
        firstName: String!
        createdAt: String!
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
      "extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
      }

      type Author {
        id: ID!
        firstName: String!
        createdAt: DateTime!
        startTime: DateTime!
        startDate: Date!
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
      "extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
      }

      type Author {
        id: ID!
        firstName: String!
        createdAt: DateTime!
        startDate: Date!
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
      "extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
      }

      type Author {
        id: ID!
        color: ColorDetail!
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
      "extend type Mutation {
        saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
      }

      type Author {
        id: ID!
        color: [Color!]!
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
      "extend type Mutation {
        saveSmallPublisher(input: SaveSmallPublisherInput!): SaveSmallPublisherResult!
      }

      type SmallPublisher {
        id: ID!
        name: String!
        city: String!
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
     "extend type Mutation {
       saveAuthor(input: SaveAuthorInput!): SaveAuthorResult!
     }

     type Author {
       id: ID!
       publisher: PublisherLike!
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

async function generate(fs: Fs, opt: EntityDbMetadata[] | Partial<DbMetadata>) {
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
    totalTables: 10,
    entitiesByName,
  } satisfies DbMetadata;
  return generateGraphqlSchemaFiles(fs, dbMeta);
}
