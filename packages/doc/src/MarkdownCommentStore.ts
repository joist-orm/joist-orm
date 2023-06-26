import { readFile } from "fs/promises";
import { EntityDbMetadata } from "joist-codegen";
import * as path from "path";
import { remark } from "remark";
import { CommentStore, FieldSourceType } from "./CommentStore";

/**
 * A Markdown CommentStore with opinionated but loose semantics around
 * markdown document structure
 */
export class MarkdownCommentStore extends CommentStore {
  private documents = new Map<string, Promise<null | ReturnType<(typeof remark)["parse"]>>>();

  async forField(entity: EntityDbMetadata, fieldName: string, source: FieldSourceType) {
    return this.findHeadingContent(entity, fieldName);
  }

  async forEntity(entity: EntityDbMetadata): Promise<string | void> {
    return this.findRootContent(entity);
  }

  private async getDocument(filename: string) {
    const existing = this.documents.get(filename);

    if (existing !== undefined) return existing;

    const promise = readFile(path.join(this.config.entitiesDirectory, `${filename}.md`), { encoding: "utf-8" })
      .then((contents) => {
        return remark.parse(contents);
      })
      .catch(() => null);

    this.documents.set(filename, promise);

    return promise;
  }

  /**
   * Finds content for a given heading. The semantics used here are:
   * - any level heading, which allows for more flexibility in how users want
   *   format their docs (second level, 3rd under more groupings etc)
   * - if found, we continue to collect paragraphs until there is another node
   *   This means horizontal rules can be used to limit the amount ingested.
   *   Allowing for more in-depth documentation in the markdown file.
   * @param entity
   * @param heading
   * @private
   */
  private async findHeadingContent(entity: EntityDbMetadata, heading: string) {
    const document = await this.getDocument(entity.name);

    if (!document) return undefined;

    let found = false;
    const parts = [];
    for (const part of document.children) {
      if (!found && part.type === "heading" && part.children[0].type === "text" && part.children[0].value === heading) {
        found = true;
        continue;
      }

      if (found) {
        if (part.type === "paragraph") {
          parts.push(part);
          continue;
        }

        break;
      }
    }

    return found && parts.length > 0 ? remark.stringify({ type: "root", children: parts }) : undefined;
  }

  /**
   * Finds the "root" content, used for the general description of a concept
   * vs properties within
   * - If starting without a heading, we will collect from there
   * - If a starting heading is used, we will collect content from beneath there
   * - If there is no content between the first two headings, we will collect from the second
   *   if the name is blessed.
   * @param entity
   * @private
   */
  private async findRootContent(entity: EntityDbMetadata) {
    const document = await this.getDocument(entity.name);

    if (!document) return undefined;

    let parts = [];
    // pattern matching would be nice.
    // [0] === para...
    if (document.children[0].type === "paragraph") {
      for (const item of document.children) {
        if (item.type === "paragraph") {
          parts.push(item);
        } else {
          break;
        }
      }

      // [0] === heading, [1] === para...
    } else if (document.children[0].type === "heading" && document.children[1].type === "paragraph") {
      for (const item of document.children.slice(1)) {
        if (item.type === "paragraph") {
          parts.push(item);
        } else {
          break;
        }
      }
      // [0] heading, [1] = heading=Overview, [2] === para...
    } else if (
      document.children[0].type === "heading" &&
      document.children[1].type === "heading" &&
      document.children[1].children[0].type === "text" &&
      document.children[1].children[0].value === "Overview" &&
      document.children[2].type === "paragraph"
    ) {
      for (const item of document.children.slice(2)) {
        if (item.type === "paragraph") {
          parts.push(item);
        } else {
          break;
        }
      }
    }

    return parts.length > 0 ? remark.stringify({ type: "root", children: parts }) : undefined;
  }
}
