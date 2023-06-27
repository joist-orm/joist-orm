import * as t from "@babel/types";
import { Config } from "joist-codegen";
import { CommentStore } from "./CommentStore";

/**
 * Represents a transformation of a source file, tied to a Joist concept
 * such as an Entity or Enum
 */
export interface IntegrationHandler<Topic> {
  /**
   * File this handler targets
   */
  file: (topic: Topic, config: Config) => string;

  /**
   * A hash provided by the CommentStore, or undefined to disable caching.
   */
  commentStoreHash: (topic: Topic, commentStore: CommentStore) => Promise<string | undefined>;

  /**
   * Executes this integration, taking in and then returning a mutated ast.
   */
  handle(source: t.File, topic: Topic, commentStore: CommentStore): Promise<t.File>;
}
