import { pascalCase } from "change-case";
import { code, CodegenFile, imp } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { DeepNew, FactoryOpts, newTestInstance } from "./symbols";

const EntityManager = imp("t:EntityManager@./entities");

export function generateFactoriesFiles(entities: EntityDbMetadata[]): CodegenFile[] {
  // One-time create an Author.factories.ts for each entity
  const entityFiles = entities.map(({ entity }) => {
    const name = pascalCase(entity.name);
    const contents = code`
      /** @ignore */
      export function new${name}(
        em: ${EntityManager},
        opts: ${FactoryOpts}<${entity.type}> = {},
      ): ${DeepNew}<${entity.type}> {
        return ${newTestInstance}(em, ${entity.type}, opts);
      }`;
    return { name: `./${entity.name}.factories.ts`, contents, overwrite: false };
  });

  // Everytime create a factories.ts that exports the others
  const factoriesFile = {
    name: "./factories.ts",
    contents: code`${entities.map(({ entity }) => code`export * from "./${entity.name}.factories";`)}`,
    overwrite: true,
    hash: true,
  };

  return [...entityFiles, factoriesFile];
}
