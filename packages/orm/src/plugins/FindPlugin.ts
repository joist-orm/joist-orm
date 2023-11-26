import { EntityMetadata } from "../EntityMetadata";
import { ParsedFindQuery } from "../QueryParser";

export interface FindPlugin {
  beforeFind(meta: EntityMetadata, query: ParsedFindQuery): void;
}
