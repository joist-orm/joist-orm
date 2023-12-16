import { pascalCase } from "change-case";
import pluralize from "pluralize";
import { code, Code } from "ts-poet";
import { Config } from "./config";
import { EnumTableData } from "./index";
import { EnumMetadata } from "./symbols";

export function generateEnumFile(config: Config, enumData: EnumTableData, enumName: string): Code {
  const { rows, extraPrimitives } = enumData;
  const detailsName = `${enumName}Details`;
  const idType = enumData.idType === "uuid" ? "string" : "number";

  // Create the `const fooDetails = code -> literal` mapping
  const detailsDefinition = [
    `id: ${idType};`,
    `code: ${enumName};`,
    "name: string;",
    ...extraPrimitives.map((primitive) => {
      // If the extra primitive values are all unique, then allow the type be only that set of values. Otherwise, use `fieldType`
      const allValues = rows.map((r) => r[primitive.columnName]);
      const uniqueValues = new Set(allValues);
      if (uniqueValues.size === allValues.length) {
        return `${primitive.fieldName}: ${
          primitive.fieldType === "string" ? `"${allValues.join('" | "')}"` : allValues.join(" | ")
        };`;
      }
      return `${primitive.fieldName}: ${primitive.fieldType};`;
    }),
  ].join(" ");

  return code`
    export enum ${enumName} {
      ${rows.map((row) => `${pascalCase(row.code)} = '${row.code}'`).join(",\n")}
    }

    export type ${detailsName} = {${detailsDefinition}};

    const details: Record<${enumName}, ${detailsName}> = {
      ${rows
        .map((row) => {
          const code = pascalCase(row.code);
          const safeName = row.name.replace(/(["'])/g, "\\$1");
          const extras = extraPrimitives
            .map((p) => `${p.fieldName}: ${JSON.stringify((row as any)[p.columnName])}`)
            .join(", ");
          const id = enumData.idType === "uuid" ? `"${row.id}"` : row.id;
          return `[${enumName}.${code}]: { id: ${id}, code: ${enumName}.${code}, name: '${safeName}', ${extras} }`;
        })
        .join(",")}
    };
    
    export const ${detailsName}: Record<${enumName}[0], ${detailsName}> = {
      ${rows.map((row) => `${pascalCase(row.code)}: details[${enumName}.${pascalCase(row.code)}]`).join(",")}
    };

    export const ${pluralize(enumName)}: ${EnumMetadata}<${enumName}, ${detailsName}, ${idType}> = {
      name: "${enumName}",

      getByCode(code: ${enumName}): ${detailsName} {
        return details[code];
      },

      findByCode(code: string): ${detailsName} | undefined {
        return details[code as ${enumName}];
      },

      findById(id: ${idType}): ${detailsName} | undefined {
        return Object.values(details).find(d => d.id === id);
      },

      getValues(): ReadonlyArray<${enumName}> {
        return Object.values(${enumName});
      },

      getDetails(): ReadonlyArray<${detailsName}> {
        return Object.values(details);
      },
    };
  `;
}
