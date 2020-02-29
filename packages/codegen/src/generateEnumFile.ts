import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { pascalCase } from "change-case";
import pluralize from "pluralize";
import { EnumRows } from "./index";

export function generateEnumFile(table: Table, enumRows: EnumRows, enumName: string): Code {
  const rows = enumRows[table.name];
  return code`
    export enum ${enumName} {
      ${rows.map(row => `${pascalCase(row.code)} = '${row.code}'`).join(",\n")}
    }

    type Details = { id: number, code: ${enumName}, name: string };

    const details: Record<${enumName}, Details> = {
      ${rows
        .map(row => {
          const code = pascalCase(row.code);
          const safeName = row.name.replace(/(["'])/g, "\\$1");
          return `[${enumName}.${code}]: { id: ${row.id}, code: ${enumName}.${code}, name: '${safeName}' }`;
        })
        .join(",")}
    };

    export const ${pluralize(enumName)} = {
      getByCode(code: ${enumName}): Details {
        return details[code];
      },

      findByCode(code: string): Details | undefined {
        return details[code as ${enumName}];
      },

      findById(id: number): Details | undefined {
        return Object.values(details).find(d => d.id === id);
      },

      getValues(): ReadonlyArray<${enumName}> {
        return Object.values(${enumName});
      },

      getDetails(): ReadonlyArray<Details> {
        return Object.values(details);
      },
    };
  `;
}
