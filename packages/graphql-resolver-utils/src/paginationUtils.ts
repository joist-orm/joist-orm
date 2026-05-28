import { type Entity, type EntityManager, type GraphQLFilterWithAlias } from "joist-core";

export type ContextWithEm = { em: EntityManager };
export type PaginationFilter<T extends Entity> = GraphQLFilterWithAlias<T>;

export const defaultLimit = 100;
