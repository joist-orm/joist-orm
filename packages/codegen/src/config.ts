import { Entity } from "EntityDbMetadata";

export interface Config {
  entitiesDirectory: string;
  derivedFields: string[];
  asyncDerivedFields: string[];
  protectedFields: string[];
  codegenPlugins: string[];
}

export const defaultConfig: Config = {
  entitiesDirectory: "./src/entities",
  derivedFields: [],
  asyncDerivedFields: [],
  protectedFields: [],
  codegenPlugins: [],
};

export const ormMaintainedFields = ["createdAt", "updatedAt"];

export function isDerived(config: Config, entity: Entity, fieldName: string): boolean {
  return config.derivedFields.includes(`${entity.name}.${fieldName}`);
}

export function isAsyncDerived(config: Config, entity: Entity, fieldName: string): boolean {
  return config.asyncDerivedFields.includes(`${entity.name}.${fieldName}`);
}

export function isProtected(config: Config, entity: Entity, fieldName: string): boolean {
  return config.protectedFields.includes(`${entity.name}.${fieldName}`);
}
