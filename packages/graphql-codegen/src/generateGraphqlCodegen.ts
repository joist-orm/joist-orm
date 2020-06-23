import { pascalCase } from "change-case";
import { CodeGenFile, EntityDbMetadata, EnumRows } from "joist-codegen";
import { code } from "ts-poet";

/** Generates a `graphql-codegen-joist.js` with the auto-generated mapped type/enum value settings. */
export function generateGraphqlCodegen(entities: EntityDbMetadata[], enums: EnumRows): CodeGenFile {
  const contents = code`
    const mappers = {
      ${entities.map((m) => {
        return `${m.entity.name}: "@src/entities#${m.entity.idType.value}",`;
      })}
      ${Object.entries(enums).map(([_name, rows]) => {
        const name = pascalCase(_name);
        return `${name}Detail: "@src/entities#${name}",`;
      })}
    };

    const enumValues = {
      ${Object.keys(enums).map((_name) => {
        const name = pascalCase(_name);
        return `${name}: "@src/entities#${name}",`;
      })}
    };

    module.exports = { mappers, enumValues };
  `;
  return { name: "../../graphql-codegen-joist.js", overwrite: true, contents };
}
