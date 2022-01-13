import { pascalCase } from "change-case";
import { code, Code } from "ts-poet";
import { Config } from "./config";
import { PgEnumData } from "./index";

export function generatePgEnumFile(config: Config, enumData: PgEnumData): Code {
  const { name, values } = enumData;
  const detailsName = `${name}Details`;
  return code`
    export enum ${name} {
      ${values.map((value) => `${pascalCase(value)} = '${value}'`).join(",\n")}
    }


  `;
}
