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
    // Add `isApproved` / etc. accessors
    ...rows.map((row) => `is${pascalCase(row.code)}: boolean;`),
  ].join(" ");
  return code`
    export enum ${enumName} {
      ${rows.map((row) => `${pascalCase(row.code)} = '${row.code}'`).join(",\n")}
    }

    export type ${detailsName} = {
      ${detailsDefinition}
    };

    const details: Record<${enumName}, ${detailsName}> = {
      ${rows
        .map((row) => {
          const code = pascalCase(row.code);
          const safeName = row.name.replace(/(["'])/g, "\\$1");
          const extras = extraPrimitives
            .map((p) => `${p.fieldName}: ${JSON.stringify((row as any)[p.columnName])}`)
            .join(", ");
          const accessors = rows
            .map((otherRow) => {
              return `is${pascalCase(otherRow.code)}: ${row === otherRow}`;
            })
            .join(", ");
          return `[${enumName}.${code}]: {
             id: ${row.id},
             code: ${enumName}.${code},
             name: '${safeName}',
             ${accessors},
             ${extras}
          }`;
        })
        .join(",")}
    };

    export const ${pluralize(enumName)} = {
      ${rows
        .map((row) => {
          const code = pascalCase(row.code);
          return `${code}: details[${enumName}.${code}],`;
        })
        .join("\n")}
      
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
