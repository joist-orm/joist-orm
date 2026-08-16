import { pascalCase } from "change-case";
import { type Code, code } from "ts-poet";

import { type Config } from "./config.ts";
import { type PgEnumData } from "./index.ts";

export function generatePgEnumFile(config: Config, enumData: PgEnumData): Code {
  const { name, values } = enumData;
  const detailsName = `${name}Details`;
  return code`
    export enum ${name} {
      ${values.map((value) => `${pascalCase(value)} = '${value}'`).join(",\n")}
    }


  `;
}
