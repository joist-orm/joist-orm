import { FilterWithAlias } from "EntityFilter";
import { EntityMetadata, ManyToManyField, ManyToOneField, OneToManyField, OneToOneField } from "./EntityMetadata";
import { abbreviation } from "./QueryBuilder";
import {
  ColumnCondition,
  JoinTable,
  ParsedFindQuery,
  mapToDb,
  parseEntityFilter,
  parseValueFilter,
} from "./QueryParser";
import { kqDot } from "./keywords";
import { fail } from "./utils";

export class AliasAssigner {
  // A map of tableName => next alias number
  #aliases: Record<string, number> = {};

  constructor(query?: ParsedFindQuery) {
    this.getAlias = this.getAlias.bind(this);
    // If we're assigning aliases into an existing query, get the current assignments
    if (query) {
      for (const table of query.tables) {
        // Ignore CTI base/sub aliases
        if (table.alias.includes("_")) continue;
        const abbrev = abbreviation(table.table);
        const i = this.#aliases[abbrev] || 0;
        const j = Number(table.alias.replace(abbrev, "")) + 1;
        this.#aliases[abbrev] = Math.max(i, j);
      }
    }
  }

  getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = this.#aliases[abbrev] || 0;
    this.#aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  /**
   * Given a `ParsedFindQuery` query, adds a new `where` filter for the given
   * `alias` + `meta`.
   *
   * All conditions in the `where` filter will be added to the `inlineConditions`
   * parameter, which for `em.find` queries are all the "embedded" conditions that
   * are AND-d together.
   *
   * Note that currently we only support primitive `where` filters, i.e. we don't
   * add new tables/joins to `query`, but in theory we could if implemented.
   */
  addFilter(
    query: ParsedFindQuery,
    inlineConditions: ColumnCondition[],
    alias: string,
    meta: EntityMetadata,
    where: FilterWithAlias<any>,
  ): void {
    const ef = parseEntityFilter(meta, where);
    if (ef && ef.kind === "join") {
      // subFilter really means we're matching against the entity columns/further joins
      Object.keys(ef.subFilter).forEach((key) => {
        // Skip the `{ as: ... }` alias binding
        if (key === "as") return;
        const field = meta.allFields[key] ?? fail(`Field '${key}' not found on ${meta.tableName}`);
        const fa = `${alias}${field.aliasSuffix}`;
        if (field.kind === "primitive" || field.kind === "primaryKey" || field.kind === "enum") {
          const column = field.serde.columns[0];
          parseValueFilter((ef.subFilter as any)[key]).forEach((filter) => {
            inlineConditions.push({
              alias: fa,
              column: column.columnName,
              dbType: column.dbType,
              cond: mapToDb(column, filter),
            });
          });
        } else {
          throw new Error(`Unsupported field ${key}`);
        }
      });
    } else {
      throw new Error(`Unsupported where ${JSON.stringify(where)}`);
    }
  }

  // from: alias + column
  // to: table + column
  // return the found or created alias
  findOrCreateManyToOneJoin(query: ParsedFindQuery, from: string, field: ManyToOneField): JoinTable {
    return this.findOrCreateTable(
      query,
      field.otherMetadata().tableName,
      "inner",
      kqDot(from, field.serde.columns[0].columnName),
      "id",
    );
  }

  findOrCreateOneToOneJoin(query: ParsedFindQuery, from: string, field: OneToOneField): JoinTable {
    const columnName = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
    return this.findOrCreateTable(query, field.otherMetadata().tableName, "inner", kqDot(from, "id"), columnName);
  }

  findOrCreateOneToManyJoin(query: ParsedFindQuery, from: string, field: OneToManyField): JoinTable {
    const columnName = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
    return this.findOrCreateTable(query, field.otherMetadata().tableName, "outer", kqDot(from, "id"), columnName);
  }

  findOrCreateManyToManyJoin(query: ParsedFindQuery, from: string, field: ManyToManyField): JoinTable {
    // Always join into the m2m table
    const joinTable = this.findOrCreateTable(
      query,
      field.joinTableName,
      "outer",
      kqDot(from, "id"),
      field.columnNames[0],
    );
    // Now look for the actual other side
    return this.findOrCreateTable(
      query,
      field.otherMetadata().tableName,
      "outer",
      kqDot(joinTable.alias, field.columnNames[1]),
      "id",
    );
  }

  /** Looks in `query` for a table that matches the join/col1/col2 conditions. */
  public findOrCreateTable(
    query: ParsedFindQuery,
    tableName: string,
    join: "inner" | "outer",
    col1: string,
    col2Name: string,
  ): JoinTable {
    let otherTable = query.tables.find((t) => {
      const col2 = kqDot(t.alias, col2Name);
      return (
        t.join === join &&
        t.table === tableName &&
        ((t.col1 === col1 && t.col2 === col2) || (t.col1 === col2 && t.col2 === col1))
      );
    });
    if (!otherTable) {
      const alias = this.getAlias(tableName);
      const col2 = kqDot(alias, col2Name);
      const table = { alias, table: tableName, join, col1, col2 } satisfies JoinTable;
      query.tables.push(table);
      otherTable = table;
    }
    return otherTable as JoinTable;
  }
}
