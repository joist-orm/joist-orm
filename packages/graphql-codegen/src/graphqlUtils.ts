import { DocumentNode, InputObjectTypeDefinitionNode, ObjectTypeDefinitionNode, parse, print, visit } from "graphql";
import { groupBy } from "joist-utils";
import prettier, { resolveConfig } from "prettier";
import { Fs } from "./utils";

/** A type for the fields we want to add to `*.graphql` files. */
export type GqlField = {
  file: string;
  objectType: "input" | "output";
  objectName: string;
  fieldName: string;
  fieldType: string;
};

/** Given a `file` and `fields` to go in it (for potentially different objects), upserts into the existing types. */
export async function upsertIntoFile(fs: Fs, file: string, fields: GqlField[]): Promise<void> {
  // Group the fields by each individual object (either input types or output types)
  const byObjectName = groupBy(fields, (f) => f.objectName);
  const existingDoc = parseOrNewEmptyDoc(await fs.load(file));

  // For each type, create a "new" / ideal definition that exactly matches the domain model
  const newDocs = Object.entries(byObjectName).map(([objectName, fields]) => {
    return [objectName, createNewDoc(objectName, fields)] as [string, DocumentNode];
  });

  // Merge each `newDoc` object definition into the file's existing types
  const content = print(mergeDocs(existingDoc, newDocs));
  const prettierConfig = await resolveConfig("./");
  const formatted = prettier.format(content, { parser: "graphql", ...prettierConfig });

  await fs.save(file, formatted);
}

/**
 * Creates a new AST DocumentNode for the given object + field definitions.
 *
 * This leverages `parse` to do the dirty work of taking an "easy for us to create"
 * string of GraphQL SDL and turning it into a "pita to create by hand" AST
 * of object / field / type / etc. nodes.
 */
function createNewDoc(objectName: string, fields: GqlField[]): DocumentNode {
  const type = fields[0].objectType === "input" ? "input" : "type";
  return parse(`${type} ${objectName} {
    ${fields.map((f) => `${f.fieldName}: ${f.fieldType}`)}
  }`);
}

function parseOrNewEmptyDoc(content: string | undefined): DocumentNode {
  return content ? parse(content) : newEmptyDocument();
}

function newEmptyDocument(): DocumentNode {
  // I can't figure out how to `parse("")`, i.e. create an empty DocumentNode, so pretend
  // to make a `type Foo` but then throw it away so that DocumentNode ends up empty.
  return visit(parse("type Foo"), {
    ObjectTypeDefinition() {
      return null;
    },
  });
}

/**
 * Merges a given `newType` from `newDoc` into `existingDoc*.
 *
 * There are existing "merge schema" libraries/tools out there, but we want to be very purposeful
 * about keeping the existing SDL and this is really not too bad because we're only stitching
 * ~two levels of the AST (document -> objects and object -> fields).
 *
 * We also cheat by using `createNewDoc` to get ASTs of the new content, so we don't have
 * to laboriously built up the ASTs by hand.
 */
function mergeDocs(existingDoc: DocumentNode, newDocs: [string, DocumentNode][]): DocumentNode {
  // Now merged the two
  return visit(existingDoc, {
    // If the `type Book` does not exist yet, add it
    Document(node) {
      return {
        ...node,
        definitions: [
          ...node.definitions,
          ...newDocs
            .filter(([objectType]) => {
              return !node.definitions.some(
                (d) =>
                  (d.kind === "ObjectTypeDefinition" || d.kind === "InputObjectTypeDefinition") &&
                  d.name.value === objectType,
              );
            })
            .map(([, d]) => d.definitions),
        ],
      };
    },

    // If fields don't exist yet, add them
    ObjectTypeDefinition(node) {
      const found = newDocs.find(([objectType]) => node.name.value === objectType);
      if (found) {
        const [, newDoc] = found;
        const existingFieldNames = (node.fields || []).map((f) => f.name.value);
        const newObjectType = newDoc.definitions[0] as ObjectTypeDefinitionNode;
        return {
          ...node,
          fields: [
            ...(node.fields || []),
            ...(newObjectType.fields || []).filter((f) => !existingFieldNames.includes(f.name.value)),
          ],
        };
      }
      return node;
    },

    // If fields don't exist yet, add them
    InputObjectTypeDefinition(node) {
      const found = newDocs.find(([objectType]) => node.name.value === objectType);
      if (found) {
        const [, newDoc] = found;
        const existingFieldNames = (node.fields || []).map((f) => f.name.value);
        const newObjectType = newDoc.definitions[0] as InputObjectTypeDefinitionNode;
        return {
          ...node,
          fields: [
            ...(node.fields || []),
            ...(newObjectType.fields || []).filter((f) => !existingFieldNames.includes(f.name.value)),
          ],
        };
      }
      return node;
    },
  });
}
