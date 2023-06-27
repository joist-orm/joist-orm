import generate from "@babel/generator";
import { parse } from "@babel/parser";
import { createFromBuffer, Formatter } from "@dprint/formatter";
import { getPath } from "@dprint/typescript";
import { readFile, writeFile } from "fs/promises";
import type { Config, DbMetadata } from "joist-codegen";
import pLimit from "p-limit";
import { Cache } from "./Cache";
import { CommentStore } from "./CommentStore";
import { IntegrationHandler } from "./integrationHandler";
import { entityIntegration } from "./integrations/entity";
import { entityCodegenIntegration } from "./integrations/entityCodegen";
import { enumIntegration } from "./integrations/enum";
import { MarkdownCommentStore } from "./MarkdownCommentStore";
import { hashString } from "./utils";

class JoistDoc {
  private cache = new Cache();

  private formatter: undefined | Formatter;
  constructor(private commentStore: CommentStore, private metadata: DbMetadata, private config: Config) {}

  /**
   * Runs an integration handler, handling the common stuff
   *
   * - calculates source hash
   * - asks commentStore for its hash
   * - if nothing has changed and we have a restore, exit early and use that
   *
   * - otherwise: parse, run handler, generated, dprint, write, update cache
   */
  async run<T>(integration: IntegrationHandler<T>, topic: T) {
    const filePath = integration.file(topic, this.config);
    const file = await readFile(filePath, { encoding: "utf-8" });

    const sourceHash = hashString(file);
    const commentStoreHash = await integration.commentStoreHash(topic, this.commentStore);

    if (commentStoreHash) {
      const existingCache = await this.cache.get(filePath, { sourceHash, commentStoreHash });

      if (existingCache) {
        await writeFile(filePath, existingCache, { encoding: "utf-8" });
        return;
      }
    }

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
   * Lazy load this on demand, so we can avoid the cost for cached runs.
   */
  async getFormatter() {
    if (this.formatter) return this.formatter;

    const buffer = await readFile(getPath());
    this.formatter = createFromBuffer(buffer);

    return this.formatter;
  }

  async process() {
    const limit = pLimit(16);

    const entityCodegen = this.metadata.entities.map((entity) =>
      limit(() => this.run(entityCodegenIntegration, entity)),
    );
    const entity = this.metadata.entities.map((entity) => limit(() => this.run(entityIntegration, entity)));
    const pgEnums = Object.values(this.metadata.pgEnums).map((enumField) =>
      limit(() => this.run(enumIntegration, enumField)),
    );
    const enums = Object.values(this.metadata.enums).map((enumField) =>
      limit(() => this.run(enumIntegration, enumField)),
    );

    await Promise.all([...entityCodegen, ...entity, ...pgEnums, ...enums]);

    this.cache.save();
  }
}

export async function tsDocIntegrate(config: Config, metadata: DbMetadata) {
  const commentStore = new MarkdownCommentStore(config);
  const joistDoc = new JoistDoc(commentStore, metadata, config);

  await joistDoc.process();
}
