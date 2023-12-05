import {
  AliasAssigner,
  ColumnCondition,
  deTagId,
  Entity,
  EntityMetadata,
  FindPlugin,
  JoinTable,
  OneToManyCollection,
  ParsedFindQuery,
  Relation,
} from "joist-orm";
import { FindCallback } from "joist-orm/build/plugins/FindPlugin";
import { AuthRule, parseAuthRule, ParsedAuthRule } from "./authRule";

/**
 * Implements a `FindPlugin` that injects ReBAC-style auth rules into the query.
 */
export class RebacAuthPlugin<T extends Entity> implements FindPlugin {
  #rootMeta: EntityMetadata<T>;
  #rootId: string;
  #rules: Record<string, ParsedAuthRule<any>[]>;
  // Keep a map of entity -> auth rule that allowed it to be loaded into memory
  #entities: Map<Entity, ParsedAuthRule<any>> = new Map();

  constructor(rootMeta: EntityMetadata<T>, rootId: string, rule: AuthRule<T>) {
    this.#rootMeta = rootMeta;
    this.#rootId = rootId;
    this.#rules = parseAuthRule(rootMeta, rule);
  }

  beforeLoad(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void {
    // What rule loaded this entity into the graph?
    const rule = this.#entities.get(entity);
    if (rule) {
      if (relation instanceof OneToManyCollection) {
        const r = rule.relations[relation.fieldName];
        if (r) {
        } else {
          throw new Error(`cannot load ${relation.fieldName}`);
        }
      }
    }
  }

  beforeFind(meta: EntityMetadata<any>, query: ParsedFindQuery): FindCallback {
    // How would we tell if this is loading an o2m like book -> reviews,
    // and a) we've already auth'd book, and b) reviews is included as
    // accessible, then we don't need to re-inject auth into the query.
    // Maybe `beforeFind` should be told the high-level operation being
    // performed, i.e `m2o`, `o2m`, etc.

    // Is this meta something we should scope?
    const rules = this.#rules[meta.cstr.name];
    if (!rules) return;
    // Work with just one rule for now
    const [rule] = rules;

    const aa = new AliasAssigner(query);
    const joins: JoinTable[] = [];

    // We've got basically a lens from `meta` --> our `rootMeta`, so we
    // want to add a WHERE clause
    let currentMeta = meta;
    let currentTable = query.tables.find((t) => t.join === "primary")!;

    const inlineConditions: ColumnCondition[] = [];

    if (rule.where) {
      aa.addFilter(query, inlineConditions, currentTable.alias, rule.meta, rule.where);
    }

    // I.e. start at `Book`, and walk `author` -> `userOneToOne`
    for (const { meta, relation, where } of rule.pathToUser) {
      const field = currentMeta.allFields[relation];
      // Need to have the where clause as well...
      // console.log(field);
      switch (field.kind) {
        case "m2o": {
          // Inject a new table for our new join
          // I.e. currentTable is `books` and we're looking at `Book.author`.
          currentTable = aa.findOrCreateManyToOneJoin(query, currentTable.alias, field);
          currentMeta = field.otherMetadata();
          break;
        }
        case "o2o": {
          // I.e. currentTable is 'authors' and we're looking at `Author.userOneToOne`
          currentTable = aa.findOrCreateOneToOneJoin(query, currentTable.alias, field);
          currentMeta = field.otherMetadata();
          break;
        }
        default:
          throw new Error(`Unsupported kind ${field.kind}`);
      }

      if (where) {
        const alias = currentTable.alias;
        aa.addFilter(query, inlineConditions, alias, meta, where);
      }
    }

    const cond: ColumnCondition = {
      alias: currentTable.alias,
      column: "id",
      dbType: currentMeta.idDbType,
      cond: { kind: "eq", value: deTagId(this.#rootMeta, this.#rootId) },
    };

    if (!query.condition) {
      query.condition = { op: "and", conditions: [cond] };
    } else if (query.condition.op === "and") {
      query.condition.conditions.push(cond);
    } else {
      query.condition = {
        op: "and",
        conditions: [query.condition, cond],
      };
    }
    query.condition.conditions.push(...inlineConditions);

    query.tables.push(...joins);

    return (entities) => {
      for (const entity of entities) {
        this.#entities.set(entity, rule);
      }
    };

    // throw new Error(`Method not implemented ${rule.pathToUser.join("/")}`);
  }
}
