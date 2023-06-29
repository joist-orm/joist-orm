import { Config, EntityDbMetadata } from "joist-codegen";

/**
 * Not used within MarkdownCommentStore, but allows additional customisation
 * of the Field comments by presenting the target place it will be used.
 */
export type FieldSourceType = "get" | "set" | "opts";

export type EnumData = { name: string };

/**
 * The base API for a providing comments to be applied to the various files.
 *
 * Focused around Joist concepts (Entities, Fields etc) over the files themselves.
 */
export abstract class CommentStore {
  constructor(protected config: Config) {}

  /**
   * Provides a comment for a Entity Field
   */
  abstract forField(
    entity: EntityDbMetadata,
    fieldName: string,
    source: FieldSourceType,
    generated: boolean,
  ): Promise<string | undefined>;

  /**
   * Provides a comment for a Entity itself
   */
  abstract forEntity(entity: EntityDbMetadata, generated: boolean): Promise<string | undefined>;

  /**
   * Provides a comment for an Enum
   */
  abstract forEnum(enumField: EnumData, generated: boolean): Promise<string | undefined>;

  /**
   * Provides a comment for a Enum member
   */
  abstract forEnumMember(enumField: EnumData, name: string, generated: boolean): Promise<string | undefined>;

  /**
   * Calculate a hash (or deterministic value) for the data this entity uses for comments
   *
   * Used for caching, if the returned hash hasn't changed from the last run,
   * joist-doc will mark this as not needing to run (from the CommentStore side)
   *
   * `undefined` will opt out of caching and decrease performance
   */
  abstract hashForEntity(entity: EntityDbMetadata): Promise<string | undefined>;

  /**
   * Calculate a hash (or deterministic value) for the data this enum uses for comments
   *
   * Used for caching, if the returned hash hasn't changed from the last run,
   * joist-doc will mark this as not needing to run (from the CommentStore side)
   *
   * `undefined` will opt out of caching and decrease performance
   */
  abstract hashForEnum(enumField: EnumData): Promise<string | undefined>;
}
