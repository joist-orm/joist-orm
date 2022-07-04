import { pascalCase } from "change-case";
import { code, Code, joinCode } from "ts-poet";
import { Config } from "./config";
import { EnumTableData } from "./index";

export function generateEnumFile(config: Config, enumData: EnumTableData, enumName: string): Code {
  const { rows, extraPrimitives } = enumData;

  // Make the `public readonly static Blue = new Color(...)` declarations
  const singletonFields = rows.map((row) => {
    const params = [
      row.id,
      `"${row.code}"`,
      `"${row.name}"`,
      ...extraPrimitives.map((p) => JSON.stringify((row as any)[p.columnName])),
    ];
    return code`public readonly static ${pascalCase(row.code)} = new ${enumName}<"${row.code}">(${params.join(", ")})`;
  });

  const cstrFieldParams = [
    "public id: number",
    "public code: C",
    "public name: string",
    ...extraPrimitives.map(({ fieldName, fieldType, columnName }) => {
      // If the extra primitive values are all unique, then allow the type be only that set of values. Otherwise, use `fieldType`
      const allValues = rows.map((r) => r[columnName]);
      const uniqueValues = new Set(allValues);
      if (uniqueValues.size === allValues.length) {
        return `public ${fieldName}: ${
          fieldType === "string" ? `"${allValues.join('" | "')}"` : allValues.join(" | ")
        }`;
      }
      return `public ${fieldName}: ${fieldType}`;
    }),
  ];

  // Add isLarge/isBlue/etc. accessors
  const accessors = rows.map((row) => {
    return code`
      public get is${pascalCase(row.code)}(): boolean {
        return this === ${enumName}.${pascalCase(row.code)};
      }
    `;
  });

  const codeUnion = rows.map((r) => `"${r.code}"`).join(" | ");

  return code`
    type ${enumName}Codes = ${codeUnion};
    
    export class ${enumName}<C extends ${enumName}Codes = ${enumName}Codes> {
      ${joinCode(singletonFields, { on: ";" })}
      
      public static findByCode(code: string): ${enumName} | undefined {
        return ${enumName}.getValues().find((d) => d.code === code);
      }

      public static findById(id: number): ${enumName} | undefined {
        return ${enumName}.getValues().find((d) => d.id === id);
      }

      public static getValues(): ReadonlyArray<${enumName}> {
        return [${rows.map((row) => `${enumName}.${pascalCase(row.code)}`).join(", ")}];
      }
      
      private constructor(${cstrFieldParams.join(", ")}) {}
      
      ${joinCode(accessors, { on: "\n\n" })}
    }
  `;
}
