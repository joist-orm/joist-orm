import {parse} from "@babel/parser";
import * as t from "@babel/types";
import { readFile, writeFile } from "fs/promises";
import type { Config, DbMetadata } from "joist-codegen";
import { CommentStore } from "./CommentStore";
import { Cache } from "./Cache";
import { MarkdownCommentStore } from "./MarkdownCommentStore";
import {entityCodegenIntegration} from "./handlers/entityCodegen";
import generate from "@babel/generator";
import {hashString} from "./utils";

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
   * Executes this integration, taking in and returning a transformed ast.
   *
   * If there is nothing to change, the handle can return undefined to denote this and the
   * printing and writing will be avoided.
   */
  handle(source: t.File, topic: Topic, commentStore: CommentStore): Promise<t.File>
}

class JoistDoc {

  private cache = new Cache();
  constructor(private commentStore: CommentStore, private metadata: DbMetadata, private config: Config) {}

  async run<T>(integration: IntegrationHandler<T>, topic: T) {
    const filePath = integration.file(topic, this.config);
    const file = await readFile(filePath, { encoding: "utf-8" });

    // get source target hash
    const sourceHash = hashString(file);
    // get commentStore hash
    const commentStoreHash = await integration.commentStoreHash(topic, this.commentStore);

    if (commentStoreHash) {
      const existingCache = await this.cache.get(filePath, {sourceHash, commentStoreHash});

      if (existingCache) {
        await writeFile(filePath, existingCache, { encoding: "utf-8" });
        return;
      }
    }

    const source = parse(file, { sourceType: "module", plugins: ["typescript"] });
    const result = await integration.handle(source, topic, this.commentStore);

    const generated = generate(result, {}).code;

    await writeFile(filePath, generated, { encoding: "utf-8" });
    await this.cache.set(filePath, { sourceHash, commentStoreHash }, generated);
  }

  async process() {
    const entityCodegen = this.metadata.entities.map((entity) => this.run(entityCodegenIntegration, entity))

    await Promise.all([
        ...entityCodegen,
    ]);

    this.cache.save();
  }
}

export async function tsDocIntegrate(config: Config, metadata: DbMetadata) {
  const commentStore = new MarkdownCommentStore(config);
  const joistDoc = new JoistDoc(commentStore, metadata, config);

  await joistDoc.process();
}
