import generate from "@babel/generator";
import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { CommentBlock } from "@babel/types";
import { readFile, writeFile } from "fs/promises";
import type { Config, DbMetadata } from "joist-codegen";
import { EntityDbMetadata } from "joist-codegen";
import * as path from "path";
import { CommentStore } from "./CommentStore";
import { MarkdownCommentStore } from "./MarkdownCommentStore";

async function readAndParse(config: Config, file: string) {
  const source = await readFile(path.join(config.entitiesDirectory, file), { encoding: "utf-8" });

  return parse(source, { sourceType: "module", plugins: ["typescript"] });
}

/**
 * Builds a CommentBlock node with correct TSDoc formatting
 * across new files
 */
function newComment(comment: string): CommentBlock {
  return {
    type: "CommentBlock",
    value: `*\n${comment
      .split("\n")
      .map((c) => `* ${c}`)
      .join("\n")}`,
  };
}

/**
 * Handles the fully code generated *Codegen.ts files.
 *
 * Integrates docs within
 * - Field setters & getters
 * - Field properties on the Opts interface
 */
async function forEntityCodegen(config: Config, entity: EntityDbMetadata, commentStore: CommentStore) {
  const fileName = `${entity.name}Codegen.ts`;
  const file = await readAndParse(config, fileName);

  // find nodes
  let opts = undefined as NodePath<t.TSInterfaceDeclaration> | undefined;
  let klass = undefined as NodePath<t.ClassDeclaration> | undefined;

  traverse(file, {
    ClassDeclaration(path) {
      if (path.node.id.name === `${entity.name}Codegen`) {
        klass = path as NodePath<t.ClassDeclaration>;
      }
    },
    TSInterfaceDeclaration(path) {
      if (path.node.id.name === `${entity.name}Opts`) {
        opts = path as NodePath<t.TSInterfaceDeclaration>;
      }
    },
  });

  // handle the class
  if (klass) {
    const rootComment = await commentStore.forEntity(entity);
    if (rootComment) {
      // parent because the export statement is it's own node with children.
      // a lower version of @babel/types is getting in here, which is odd.
      (klass.parent.leadingComments as t.Comment[]) = [newComment(rootComment)];
    }

    for (const member of klass.node.body.body) {
      if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
        const comment = await commentStore.forField(entity, member.key.name, member.kind === "get" ? "get" : "set");

        if (comment) {
          member.leadingComments = [newComment(comment)];
        }
      }
    }
  }

  if (opts) {
    for (const property of opts.node.body.body) {
      if (t.isTSPropertySignature(property) && t.isIdentifier(property.key)) {
        const comment = await commentStore.forField(entity, property.key.name, "opts");

        if (comment) {
          property.leadingComments = [newComment(comment)];
        }
      }
    }
  }

  await writeFile(path.join(config.entitiesDirectory, fileName), generate(file, {}).code, { encoding: "utf-8" });
}

async function forEntity(config: Config, entity: EntityDbMetadata, commentStore: CommentStore) {
  // TODO: derived properties
}

export async function tsDocIntegrate(config: Config, metadata: DbMetadata) {
  const commentStore = new MarkdownCommentStore(config);

  await Promise.all([
    ...metadata.entities.flatMap((entity) => [
      forEntity(config, entity, commentStore),
      forEntityCodegen(config, entity, commentStore),
      // TODO: Enum files
    ]),
  ]);
}
