import { config } from "./config";
import { makeEntity } from "./EntityDbMetadata";
import { generateEntityCodegenFile } from "./generateEntityCodegenFile";

describe("generateEntityCodegenFile", () => {
  it("injects a documented primitive's .md doc as a tagged JSDoc on the getter", async () => {
    const meta = fakeMeta("Author", [primitive("firstName"), primitive("lastName")]);
    const docs = { overview: "", fields: { firstName: "The author's first name." } };

    const output = await generateEntityCodegenFile(config.parse({}), asDb([meta]), meta, [], docs).toString();

    // The documented getter gets the `.md` doc + `@generated` tag immediately above it (no blank line)...
    expect(getterRegion(output, "firstName")).toMatchInlineSnapshot(`
     "/**
        * The author's first name.
        * @generated Author.md
        */
       get firstName(): string {"
    `);
    // ...while the undocumented getter has no JSDoc
    expect(getterRegion(output, "lastName")).toMatchInlineSnapshot(`"get lastName(): string | undefined {"`);
  });
});

/** Returns the getter line for `fieldName` plus any JSDoc block directly above it. */
function getterRegion(output: string, fieldName: string): string {
  const lines = output.split("\n");
  const i = lines.findIndex((l) => l.includes(`get ${fieldName}(`));
  let start = i;
  if (lines[i - 1].trim().endsWith("*/")) {
    while (!lines[start - 1].trim().startsWith("/**")) start--;
    start--;
  }
  return lines
    .slice(start, i + 1)
    .join("\n")
    .trim();
}

function primitive(fieldName: string): any {
  return {
    fieldName,
    fieldType: "string",
    notNull: fieldName === "firstName",
    derived: false,
    unique: false,
    columnDefault: null,
  };
}

function fakeMeta(name: string, primitives: any[]): any {
  return {
    name,
    entity: makeEntity(name),
    tagName: name.toLowerCase().slice(0, 1),
    primitives,
    enums: [],
    pgEnums: [],
    manyToOnes: [],
    oneToManys: [],
    largeOneToManys: [],
    oneToOnes: [],
    manyToManys: [],
    manyToManyEnums: [],
    largeManyToManys: [],
    polymorphics: [],
  };
}

function asDb(entities: any[]): any {
  return { entities, entitiesByName: Object.fromEntries(entities.map((e) => [e.name, e])) };
}
