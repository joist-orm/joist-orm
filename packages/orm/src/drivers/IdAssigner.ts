import * as crypto from "crypto";
import { Knex } from "knex";
import { getOrmField } from "../BaseEntity";
import { Todo } from "../Todo";
import { keyToTaggedId } from "../keys";

export interface IdAssigner {
  assignNewIds(knex: Knex, todos: Record<string, Todo>): Promise<void>;
}

/**
 * Assigns all new entities an id directly from their corresponding sequence generator, instead of via INSERTs.
 *
 * This lets us avoid cyclic issues with some INSERTs having foreign keys to other rows that themselves
 * need to first be INSERTed.
 */
export class SequenceIdAssigner implements IdAssigner {
  async assignNewIds(knex: Knex, todos: Record<string, Todo>): Promise<void> {
    const seqStatements: string[] = [];
    Object.values(todos).forEach((todo) => {
      // Even if we have INSERTs, the user may have already assigned ids...
      const needsIds = todo.inserts.filter((e) => e.idMaybe === undefined);
      if (needsIds.length > 0) {
        const sequenceName = `${todo.metadata.tableName}_id_seq`;
        const sql = `select nextval('${sequenceName}') from generate_series(1, ${needsIds.length})`;
        seqStatements.push(sql);
      }
    });
    if (seqStatements.length > 0) {
      // There will be 1 per table; 1 single insert should be fine but we might need to batch for super-large schemas?
      const sql = seqStatements.join(" UNION ALL ");
      const result = await knex.raw(sql);
      let i = 0;
      Object.values(todos).forEach((todo) => {
        for (const insert of todo.inserts.filter((e) => e.idMaybe === undefined)) {
          // Use todo.metadata so that all subtypes get their base type's tag
          getOrmField(insert).data["id"] = keyToTaggedId(todo.metadata, result.rows![i++]["nextval"]);
        }
      });
    }
  }
}

/**
 * Creates random UUIDs for uuid-based keys in production environments.
 *
 * See {@link TestUuidAssigner} for creating stable-ish ids for tests
 */
export class RandomUuidAssigner implements IdAssigner {
  async assignNewIds(knex: Knex, todos: Record<string, Todo>): Promise<void> {
    Object.values(todos).forEach((todo) => {
      for (const insert of todo.inserts) {
        getOrmField(insert).data["id"] = keyToTaggedId(todo.metadata, crypto.randomUUID());
      }
    });
  }
}

/**
 * Creates deterministic / stable-ish UUIDs for test suites.
 *
 * We use each entity's tag as the 3rd group of digits, and a per-entity incrementing integer as
 * the 4th group of digits.
 *
 * E.g. a test with two Authors (tag `a`) and three Books (tag `b`) will get these ids:
 *
 * ```
 * 00000000-0000-0000-000a-000000000000
 * 00000000-0000-0000-000a-000000000001
 * 00000000-0000-0000-000b-000000000000
 * 00000000-0000-0000-000b-000000000001
 * 00000000-0000-0000-000b-000000000002
 * ```
 */
export class TestUuidAssigner implements IdAssigner {
  private nextId: Record<string, number> = {};

  async assignNewIds(_: Knex, todos: Record<string, Todo>): Promise<void> {
    Object.entries(todos).forEach(([, todo]) => {
      if (todo.inserts.length > 0) {
        const tag = todo.metadata.tagName.substring(0, 4).padStart(4, "0");
        this.nextId[tag] ??= 0;
        for (const insert of todo.inserts) {
          const id = String(this.nextId[tag]++);
          const uuid = `00000000-0000-0000-${tag}-${id.padStart(12, "0")}`;
          getOrmField(insert).data["id"] = keyToTaggedId(todo.metadata, uuid);
        }
      }
    });
  }

  reset() {
    this.nextId = {};
  }
}
