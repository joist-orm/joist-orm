import { pascalCase } from "change-case";
import { code } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { CodeGenFile } from "./index";
import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "./symbols";

export function generateFactoriesFiles(entities: EntityDbMetadata[]): CodeGenFile[] {
  // One-time create an Author.factories.ts for each entity
  const entityFiles = entities.map(({ entity }) => {
    const name = pascalCase(entity.name);
    const contents = code`
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
  };

  return [...entityFiles, factoriesFile];
}
