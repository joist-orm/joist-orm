import { pascalCase } from "change-case";
import pluralize from "pluralize";
import { code, Code } from "ts-poet";
import { Config } from "./config";
import { EnumTableData } from "./index";

export function generateEnumFile(config: Config, enumData: EnumTableData, enumName: string): Code {
  const { rows, extraPrimitives } = enumData;
  const detailsName = `${enumName}Details`;
  const detailsDefinition = [
    "id: number;",
    `code: ${enumName};`,
    "name: string;",
    ...extraPrimitives.map((primitive) => `${primitive.fieldName}: ${primitive.fieldType};`),
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
          return `[${enumName}.${code}]: { id: ${row.id}, code: ${enumName}.${code}, name: '${safeName}', ${extras} }`;
        })
        .join(",")}
    };

    export const ${pluralize(enumName)} = {
      getByCode(code: ${enumName}): ${detailsName} {
        return details[code];
      },

      findByCode(code: string): ${detailsName} | undefined {
        return details[code as ${enumName}];
      },

      findById(id: number): ${detailsName} | undefined {
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
