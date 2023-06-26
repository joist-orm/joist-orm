import { Config, EntityDbMetadata } from "joist-codegen";

/**
 * Not used within MarkdownCommentStore, but allows additional customisation
 * of the Field comments by presenting the target place it will be used.
 */
export type FieldSourceType = "get" | "set" | "opts";

/**
 * The base API for a providing comments to be applied to the various files.
 *
 * Focused around Joist concepts (Entities, Fields etc) over the files themselves.
 */
export abstract class CommentStore {
  constructor(protected config: Config) {}

  abstract forField(entity: EntityDbMetadata, fieldName: string, source: FieldSourceType): Promise<string | void>;

  abstract forEntity(entity: EntityDbMetadata): Promise<string | void>;
}
