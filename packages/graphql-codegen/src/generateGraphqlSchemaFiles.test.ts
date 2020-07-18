import { snakeCase } from "change-case";
import { EntityDbMetadata, makeEntity, PrimitiveField } from "joist-codegen";
import { plural } from "pluralize";
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
      "type Author {
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

      type SaveAuthorResult {
        author: Author!
      }
      "
    `);
    // And saved it in the history
    expect(JSON.parse((await fs.load(".history.json")) || "")).toMatchInlineSnapshot(`
      Object {
        "Author": Array [
          "id",
          "firstName",
        ],
        "SaveAuthorInput": Array [
          "id",
          "firstName",
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
      // And an existing graphql file without the firstName  a custom field
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
        firstName: String!
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
      "author.graphql": `""" The author """ type Author { """ The id """ id: ID! } input SaveAuthorInput { id: ID }`,
    });
    // When ran
    await generateGraphqlSchemaFiles(fs, entities);
    // Then we added the new field
    expect(await fs.load("author.graphql")).toMatchInlineSnapshot(`
      "\\"\\"\\"
       The author
      \\"\\"\\"
      type Author {
        \\"\\"\\"
         The id
        \\"\\"\\"
        id: ID!
        firstName: String!
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
});

function newFs(files: Record<string, string>): Fs {
  return {
    load: (fileName) => Promise.resolve(files[fileName]),
    save: async (fileName, content) => {
      files[fileName] = content;
    },
  };
}

function newPrimitiveField(fieldName: string, opts: Partial<PrimitiveField> = {}): PrimitiveField {
  return {
    fieldName,
    columnName: snakeCase(fieldName),
    columnType: "varchar",
    fieldType: "string",
    derived: false,
    notNull: true,
    protected: false,
    columnDefault: null,
    ...opts,
  };
}

function newEntityMetadata(name: string, opts: Partial<EntityDbMetadata> = {}): EntityDbMetadata {
  return {
    name,
    entity: makeEntity(name),
    primitives: [],
    enums: [],
    manyToOnes: [],
    oneToManys: [],
    manyToManys: [],
    oneToOnes: [],
    tableName: snakeCase(plural(name)),
    ...opts,
  };
}
