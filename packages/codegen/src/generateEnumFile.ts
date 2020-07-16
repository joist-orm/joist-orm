import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { pascalCase } from "change-case";
import pluralize from "pluralize";
import { EntityDbMetadata, EnumRows } from "./index";

export function generateEnumFile(table: Table, enumRows: EnumRows, enumName: string): Code {
  const rows = enumRows[table.name];
  const detailsName = `${enumName}Details`;
  const extraPrimitives = new EntityDbMetadata({ entities: {} } as any, table).primitives.filter(
    (p) => !["code", "name"].includes(p.fieldName),
  );
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
