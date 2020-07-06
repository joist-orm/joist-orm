import { Entity } from "EntityDbMetadata";
import { promises as fs } from "fs";
import prettier, { resolveConfig } from "prettier";
import { trueIfResolved } from "./utils";

export interface FieldConfig {
  derived?: "sync" | "async";
  protected?: boolean;
}

export interface EntityConfig {
  tag: string;
  fields?: Record<string, FieldConfig>;
}

export interface Config {
  entitiesDirectory: string;
  codegenPlugins: string[];
  entities: Record<string, EntityConfig>;
}

export const defaultConfig: Config = {
  entitiesDirectory: "./src/entities",
  codegenPlugins: [],
  entities: {},
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

const configPath = "./joist-codegen.json";
export async function loadConfig(): Promise<Config> {
  const exists = await trueIfResolved(fs.access(configPath));
  if (exists) {
    const content = await fs.readFile(configPath);
    return { ...defaultConfig, ...(JSON.parse(content.toString()) as Config) };
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
  const input = JSON.stringify(config);
  const content = prettier.format(input.trim(), { parser: "json", ...prettierConfig });
  await fs.writeFile(configPath, content);
}
