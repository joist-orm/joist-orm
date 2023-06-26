import {Config, EntityDbMetadata, EnumField} from "joist-codegen";
import {hashFile} from "./utils";
import {PgEnumField} from "joist-codegen/build/EntityDbMetadata";

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

  abstract forField(entity: EntityDbMetadata, fieldName: string, source: FieldSourceType, generated: boolean): Promise<string | void>;

  abstract forEntity(entity: EntityDbMetadata, generated: boolean): Promise<string | void>;

  abstract hashForEntity(entity: EntityDbMetadata): Promise<string | undefined>;

  abstract hashForEnum(enumField: EnumData): Promise<string | undefined>;

  abstract forEnum(enumField: EnumData, generated: boolean): Promise<string | void>;

  abstract forEnumMember(enumField: EnumData, name: string, generated: boolean): Promise<string | void>;
}
