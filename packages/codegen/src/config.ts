import { Entity } from "EntityDbMetadata";
import { promises as fs } from "fs";
import prettier, { resolveConfig } from "prettier";
import { fail, sortKeys, trueIfResolved } from "./utils";

export interface FieldConfig {
  derived?: "sync" | "async";
  protected?: boolean;
  ignore?: true;
}

export interface RelationConfig {
  name?: string;
}

export interface EntityConfig {
  tag: string;
  tableName?: string;
  fields?: Record<string, FieldConfig>;
  relations?: Record<string, RelationConfig>;
}

export interface Config {
  contextType?: string;
  entitiesDirectory: string;
  codegenPlugins: string[];
  entities: Record<string, EntityConfig>;
  // We don't persist this, and instead just use it as a cache
  __tableToEntityName?: Record<string, string>;
}

export const defaultConfig: Config = {
  entitiesDirectory: "./src/entities",
  codegenPlugins: [],
  entities: {},
  __tableToEntityName: {},
};

export const ormMaintainedFields = ["createdAt", "updatedAt"];

export function isDerived(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.fields?.[fieldName]?.derived === "sync";
}

export function isAsyncDerived(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.fields?.[fieldName]?.derived === "async";
}

export function isProtected(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.fields?.[fieldName]?.protected === true;
}

export function isFieldIgnored(config: Config, entity: Entity, fieldName: string, notNull: boolean = false, hasDefault: boolean = false): boolean {
  const ignore = config.entities[entity.name]?.fields?.[fieldName]?.ignore === true;

  if (ignore && notNull && !hasDefault) {
    fail("notNull fields cannot be ignored. Alter the column to be optional prior to ignoring it.");
  }
  return ignore;
}

export function relationName(config: Config, entity: Entity, relationName: string): string {
  return config.entities?.[entity.name]?.relations?.[relationName]?.name ?? relationName;
}

const configPath = "./joist-codegen.json";
export async function loadConfig(): Promise<Config> {
  const exists = await trueIfResolved(fs.access(configPath));
  if (exists) {
    const content = await fs.readFile(configPath);
    return {
      ...defaultConfig,
      ...(JSON.parse(content.toString()) as Config),
    };
  }
  return defaultConfig;
}

/**
 * Writes the potentially-updated config entry back to `joist-codegen.json`.
 *
 * We format the output with prettier so it should both a) look nice and b) be deterministic,
 * such that no changes to the config show up as noops to the scm.
 */
export async function writeConfig(config: Config): Promise<void> {
  const prettierConfig = await resolveConfig("./");
  const sorted = sortKeys(config);
  delete sorted.__tableToEntityName;
  const input = JSON.stringify(sorted);
  const content = prettier.format(input.trim(), { parser: "json", ...prettierConfig });
  await fs.writeFile(configPath, content);
}
