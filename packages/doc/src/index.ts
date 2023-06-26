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
import pLimit from 'p-limit';
import {entityIntegration} from "./handlers/entity";
import {createFromBuffer, Formatter} from "@dprint/formatter";
import { getPath } from "@dprint/typescript";
import {enumIntegration} from "./handlers/enum";

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

  private formatter: undefined | Formatter;
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

    console.log('Re-generating for', filePath)

    const source = parse(file, { sourceType: "module", plugins: ["typescript"] });
    const result = await integration.handle(source, topic, this.commentStore);

    const formatter = await this.getFormatter();

    // This is taken from ts-poet, which joist-codegen doesn't override. It's included here
    // to try to ensure that joist-doc isn't reformatting needlessly
    const generated = formatter.formatText(filePath, generate(result, {}).code, {
      useTabs: false,
      useBraces: "always",
      singleBodyPosition: "nextLine",
      "arrowFunction.useParentheses": "force",
      // dprint-node uses `node: true`, which we want to undo
      "module.sortImportDeclarations": "caseSensitive",
      lineWidth: 120,
      // For some reason dprint seems to wrap lines "before it should" w/o this set (?)
      preferSingleLine: true,
    });

    await writeFile(filePath, generated, { encoding: "utf-8" });
    await this.cache.set(filePath, { sourceHash, commentStoreHash }, generated);
  }

  /**
   * Lazy load this on demand, so we can avoid the cost cached runs.
   */
  async getFormatter() {
    if (this.formatter) return this.formatter;

    const buffer = await readFile(getPath());
    this.formatter = createFromBuffer(buffer);

    return this.formatter;
  }

  async process() {
    const limit = pLimit(16)

    const entityCodegen = this.metadata.entities.map((entity) => limit(() => this.run(entityCodegenIntegration, entity)))
    const entity = this.metadata.entities.map((entity) => limit(() => this.run(entityIntegration, entity)))
    const pgEnums = Object.values(this.metadata.pgEnums).map((enumField) => limit(() => this.run(enumIntegration, enumField)))
    const enums = Object.values(this.metadata.enums).map((enumField) => limit(() => this.run(enumIntegration, enumField)))

    await Promise.all([
        ...entityCodegen,
        ...entity,
        ...pgEnums,
        ...enums,
    ]);

    this.cache.save();
  }
}

export async function tsDocIntegrate(config: Config, metadata: DbMetadata) {
  console.time('joist-doc');
  const commentStore = new MarkdownCommentStore(config);
  const joistDoc = new JoistDoc(commentStore, metadata, config);

  await joistDoc.process();
  console.timeEnd('joist-doc');
}
