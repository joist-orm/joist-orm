import {
  AliasAssigner,
  ColumnCondition,
  deTagId,
  Entity,
  EntityMetadata,
  FindCallback,
  FindPlugin,
  getMetadata,
  isLoadedCollection,
  isLoadedReference,
  kqDot,
  OneToManyCollection,
  ParsedFindQuery,
  Relation,
} from "joist-orm";
import { AuthRule, parseAuthRule, ParsedAuthRule } from "./authRule";

/**
 * Implements a `FindPlugin` that injects Relationship-based (ReBAC) auth rules into the query.
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
    for (const [name, rule] of Object.entries(this.#rules)) {
      console.log("RebacAuthPlugin.rule", name, rule);
    }
  }

  /**
   * Initialize the auth rules for an `entity` loaded before the auth plugin was created.
   *
   * I.e. typically you need to load the user, to know who/what role they are, to get the
   * shape necessary to create the RebacAuthPlugin. */
  seed(entity: Entity): void {
    const rules = this.#rules[getMetadata(entity).cstr.name];

    if (!rules) return;
    // Work with just one rule for now
    const [rule] = rules;
    this.#entities.set(entity, rule);

    // Scan the entity for loaded relations
    for (const [relationName, nextRule] of Object.entries(rule.relations)) {
      if (isLoadedCollection((entity as any)[relationName])) {
        const entities = (entity as any)[relationName].get;
        for (const entity of entities) {
          console.log("Adding rule", entity.toString(), nextRule.fields);
          this.#entities.set(entity, nextRule);
        }
      } else if (isLoadedReference((entity as any)[relationName])) {
        const child = (entity as any)[relationName].get;
        console.log("Adding rule", child.toString(), nextRule.fields);
        this.#entities.set(child, nextRule);
      }
    }
  }

  beforeLoad(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void {
    // What rule loaded this entity into the graph?
    const rule = this.#entities.get(entity);
    if (rule) {
      if (relation instanceof OneToManyCollection) {
        const r = rule.relations[relation.fieldName];
        if (r) {
        } else {
          throw new Error(`Access denied to ${relation}`);
        }
      }
    } else {
      // If this type has literally no rules setup, it's okay (should be configurable)
      if (this.#rules[getMetadata(entity).cstr.name] === undefined) {
        return;
      }
      throw new Error(`Access denied to ${relation}`);
    }
  }

  afterLoad(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void {
    // What rule loaded this entity into the graph?
    const rule = this.#entities.get(entity);
    if (rule) {
      if (isLoadedCollection(relation)) {
        const entities = relation.get;
        const nextRule = rule.relations[(relation as any).fieldName];
        for (const entity of entities) {
          console.log("Adding rule", entity.toString(), nextRule.fields);
          this.#entities.set(entity, nextRule);
        }
      }
    }
  }

  beforeGetField(entity: Entity, fieldName: string) {
    if (fieldName === "id") return;
    const rule = this.#entities.get(entity);
    // If no rules are defined for this entity type, assume it's okay
    const field = rule?.fields[fieldName];
    if (field === "r" || field === "rw") {
      return;
    }
    // Assume any relation mapping means they can at least read the value
    const relation = rule?.relations[fieldName];
    if (relation) {
      return;
    }
    // If this type has literally no rules setup, it's okay (should be configurable)
    if (this.#rules[getMetadata(entity).cstr.name] === undefined) {
      return;
    }
    // Otherwise deny
    console.log({ entity, rule });
    throw new Error(`Access denied to ${entity}.${fieldName}`);
  }

  beforeSetField(entity: Entity, fieldName: string, newValue: unknown) {
    const rule = this.#entities.get(entity);
    const field = rule?.fields[fieldName];
    if (field === "w" || field === "rw") {
      return;
    } else {
      throw new Error(`Access denied to ${entity}.${fieldName}`);
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

    // We've got basically a lens from `meta` --> our `rootMeta`, so we
    // want to add a WHERE clause
    let currentMeta = meta;
    let currentTable = query.tables.find((t) => t.join === "primary")!;

    const inlineConditions: ColumnCondition[] = [];

    // The rule can declare a `where: { ... }` clause, that currently must be just simple column conditions
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
        case "o2m": {
          // I.e. currentTable is 'users` and we're looking at `User.createdComments`
          currentTable = aa.findOrCreateOneToManyJoin(query, currentTable.alias, field);
          currentMeta = field.otherMetadata();
          break;
        }
        case "m2m": {
          currentTable = aa.findOrCreateManyToManyJoin(query, currentTable.alias, field);
          currentMeta = field.otherMetadata();
          break;
        }
        case "poly": {
          // If we're on `comments.parent`, which is a poly of Author|Book|Etc, but we know the pathToUser
          // is drilling up to the Author->User, we can use `meta` to find the right component/FK of the
          // poly we should join through.
          const component = field.components.find((c) => c.otherMetadata() === meta)!;
          currentTable = aa.findOrCreateTable(
            query,
            component.otherMetadata().tableName,
            "inner",
            kqDot(currentTable.alias, field.serde.columns[0].columnName),
            "id",
          );
          currentMeta = component.otherMetadata();
          break;
        }
        default:
          throw new Error(`Unsupported kind ${field.kind} of ${currentMeta.tableName}.${relation} ${meta.tableName}`);
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

    // After the entities are loaded, record where in the auth graph they came from
    return (entities) => {
      for (const entity of entities) {
        console.log("Adding rule", entity.toString(), rule.fields);
        this.#entities.set(entity, rule);
      }
    };
  }
}
