import { snakeCase } from "change-case";
import { EntityDbMetadata, EnumField, makeEntity, PrimitiveField } from "joist-codegen";
import { plural } from "pluralize";
import { imp } from "ts-poet";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles";
import { Fs } from "./utils";

describe("generateGraphqlSchemaFiles", () => {
  it("creates a new file", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    // And no existing graphql file
    const fs = newFs({});
    // When ran
    await generateGraphqlSchemaFiles(fs, entities);
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
    await generateGraphqlSchemaFiles(fs, entities);
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
      Object {
        "Author": Array [
          "firstName",
          "id",
        ],
        "Mutation": Array [
          "saveAuthor",
        ],
        "SaveAuthorInput": Array [
          "firstName",
          "id",
        ],
        "SaveAuthorResult": Array [
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
    await generateGraphqlSchemaFiles(fs, entities);
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
    await generateGraphqlSchemaFiles(fs, entities);
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
    await generateGraphqlSchemaFiles(fs, entities);
    // Then we added the new field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
      "\\" The author. \\"
      type Author {
        \\" The id. \\"
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
    await generateGraphqlSchemaFiles(fs, entities);
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

  it("can output both Date and DateTime types", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [
      newEntityMetadata("Author", {
        primitives: [
          // With a regular field
          newPrimitiveField("firstName"),
          // And a timestamp field  with the `_at` convention
          newPrimitiveField("createdAt", { fieldType: "Date" }),
          // And also a date field with the `_date` convention
          newPrimitiveField("startDate", { fieldType: "Date" }),
        ],
      }),
    ];
    // When ran
    const fs = newFs({});
    await generateGraphqlSchemaFiles(fs, entities);
    // Then the input has both both types of fields as appropriate
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
    await generateGraphqlSchemaFiles(fs, entities);
    // Then the input has both both types of fields as appropriate
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
    await generateGraphqlSchemaFiles(fs, entities);
    // Then the input has both both types of fields as appropriate
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
});

function newFs(files: Record<string, string>): Fs {
  return {
    exists: async (fileName) => !!files[fileName],
    load: async (fileName) => files[fileName],
    save: async (fileName, content) => {
      files[fileName] = content;
    },
  };
}

function newPrimitiveField(fieldName: string, opts: Partial<PrimitiveField> = {}): PrimitiveField {
  return {
    kind: "primitive",
    fieldName,
    columnName: snakeCase(fieldName),
    columnType: "varchar",
    fieldType: "string",
    rawFieldType: "string",
    derived: false,
    notNull: true,
    protected: false,
    columnDefault: null,
    superstruct: undefined,
    ...opts,
  };
}

function newEntityMetadata(name: string, opts: Partial<EntityDbMetadata> = {}): EntityDbMetadata {
  return {
    name,
    entity: makeEntity(name),
    idDbType: "int",
    primitives: [],
    enums: [],
    pgEnums: [],
    manyToOnes: [],
    oneToManys: [],
    largeOneToManys: [],
    manyToManys: [],
    largeManyToManys: [],
    oneToOnes: [],
    polymorphics: [],
    tableName: snakeCase(plural(name)),
    tagName: name,
    updatedAt: undefined,
    createdAt: undefined,
    ...opts,
  };
}

function newEnumField(fieldName: string, opts: Partial<EnumField> = {}): EnumField {
  const enumName = opts.enumName || "Color";
  const enumType = imp(`${enumName}@./entities`);
  return {
    kind: "enum",
    fieldName,
    columnName: snakeCase(fieldName),
    columnDefault: null,
    enumName,
    enumType,
    notNull: true,
    enumRows: [],
    isArray: false,
    ...opts,
  };
}
