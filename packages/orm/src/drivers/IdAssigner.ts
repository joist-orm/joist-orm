import * as crypto from "crypto";
import { Knex } from "knex";
import { keyToString } from "../keys";
import { Todo } from "../Todo";

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
      if (todo.inserts.length > 0) {
        const meta = todo.metadata;
        const sequenceName = `${meta.tableName}_id_seq`;
        const sql = `select nextval('${sequenceName}') from generate_series(1, ${
          todo.inserts.filter((e) => e.id === undefined).length
        })`;
        seqStatements.push(sql);
      }
    });
    if (seqStatements.length > 0) {
      // There will be 1 per table; 1 single insert should be fine but we might need to batch for super-large schemas?
      const sql = seqStatements.join(" UNION ALL ");
      const result = await knex.raw(sql);
      let i = 0;
      Object.values(todos).forEach((todo) => {
        for (const insert of todo.inserts.filter((e) => e.id === undefined)) {
          // Use todo.metadata so that all subtypes get their base type's tag
          insert.__orm.data["id"] = keyToString(todo.metadata, result.rows![i++]["nextval"]);
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
        insert.__orm.data["id"] = keyToString(todo.metadata, crypto.randomUUID());
      }
    });
  }
}

/**
 * Creates deterministic / stable-ish UUIDs for test suites.
 *
 * These ids can technically change as test cases insert different types/numbers
 * of entities, in different orders, but otherwise will be stable.
 */
export class TestUuidAssigner implements IdAssigner {
  // We can be cute and create per-entity UUID spaces to be more stable
  private nextId: Record<string, number> = {};

  async assignNewIds(knex: Knex, todos: Record<string, Todo>): Promise<void> {
    Object.entries(todos).forEach(([type, todo]) => {
      if (todo.inserts.length > 0) {
        // Each entity's uuid space is based on the slot/order it's added to nextId.
        // This will change across tests, i.e. it's not like tagged ids, but it's
        // an easy number to determine, and should be stable enough.
        let entitySpace = Object.keys(this.nextId).indexOf(type);
        if (entitySpace === -1) {
          this.nextId[type] = 0;
          entitySpace = Object.keys(this.nextId).indexOf(type);
        }
        for (const insert of todo.inserts) {
          const id = this.nextId[type]++;
          const uuid = `10000000-${String(entitySpace).padStart(4, "0")}-0000-0000-${String(id).padStart(12, "0")}`;
          insert.__orm.data["id"] = keyToString(todo.metadata, uuid);
        }
      }
    });
  }

  reset() {
    this.nextId = {};
  }
}
