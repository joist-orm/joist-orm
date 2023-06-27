import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { EntityDbMetadata } from "joist-codegen";
import * as path from "path";
import { IntegrationHandler } from "../integrationHandler";
import { newComment } from "../utils";

/**
 * Handles the user-land *.ts entity files.
 *
 * Integrates docs within
 * - Derived properties & Methods
 */
export const entityIntegration: IntegrationHandler<EntityDbMetadata> = {
  file: (entity, config) => path.join(config.entitiesDirectory, `${entity.name}.ts`),
  commentStoreHash: (entity, commentStore) => commentStore.hashForEntity(entity),
  async handle(source, entity, commentStore) {
    let klass = undefined as NodePath<t.ClassDeclaration> | undefined;

    traverse(source, {
      ClassDeclaration(path) {
        if (path.node.id.name === `${entity.name}`) {
          klass = path as NodePath<t.ClassDeclaration>;
        }
      },
    });

    // handle the class
    if (klass) {
      for (const member of klass.node.body.body) {
        if ((t.isClassMethod(member) || t.isClassProperty(member)) && t.isIdentifier(member.key)) {
          const comment = await commentStore.forField(entity, member.key.name, "opts", false);

          if (comment) {
            member.leadingComments = [newComment(comment)];
          }
        }
      }
    }

    return source;
  },
};
