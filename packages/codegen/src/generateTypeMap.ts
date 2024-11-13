import { DbMetadata } from "index";
import { Code, code, imp } from "ts-poet";
import { Config } from "./config";

export function generateTypeMap(config: Config, dbMeta: DbMetadata): Code {
  return code`
    export type TypeMap = {
      ${dbMeta.entities.map((entity) => {
        const types = imp(`t:${entity.name}TypeMap@./entities.ts`);
        return code`${entity.name}: ${types};`;
      })}
    };`;
}
