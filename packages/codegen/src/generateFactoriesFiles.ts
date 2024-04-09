import { pascalCase } from "change-case";
import { code, CodegenFile, imp } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { DeepNew, FactoryOpts, newTestInstance } from "./symbols";

const EntityManager = imp("t:EntityManager@./entities.ts");

export function generateFactoriesFiles(entities: EntityDbMetadata[]): CodegenFile[] {
  // One-time create an ./factories/newAuthor.ts for each entity
  return entities.map(({ entity }) => {
    const name = pascalCase(entity.name);
    const contents = code`
      export function new${name}(
        em: ${EntityManager},
        opts: ${FactoryOpts}<${entity.type}> = {},
      ): ${DeepNew}<${entity.type}> {
        return ${newTestInstance}(em, ${entity.type}, opts, {});
      }`;
    return { name: `./factories/new${entity.name}.ts`, contents, overwrite: false };
  });
}
