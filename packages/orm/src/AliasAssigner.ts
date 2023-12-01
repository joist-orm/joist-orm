import { ManyToOneField, OneToOneField } from "./EntityMetadata";
import { abbreviation } from "./QueryBuilder";
import { JoinTable, ParsedFindQuery } from "./QueryParser";
import { kqDot } from "./keywords";

export class AliasAssigner {
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

  // from: alias + column
  // to: table + column
  // return the found or created alias
  findOrCreateManyToOneJoin(query: ParsedFindQuery, from: string, field: ManyToOneField): JoinTable {
    const { tableName } = field.otherMetadata();
    const col1 = kqDot(from, field.serde.columns[0].columnName);
    const existing = query.tables.find((t) => {
      const col2 = kqDot(t.alias, "id");
      return (
        t.join === "inner" &&
        t.table === tableName &&
        ((t.col1 === col1 && t.col2 === col2) || (t.col1 === col2 && t.col2 === col1))
      );
    });
    if (existing) {
      return existing as JoinTable;
    } else {
      const alias = this.getAlias(tableName);
      const col2 = kqDot(alias, "id");
      const table = { alias, table: tableName, join: "inner", col1, col2 } satisfies JoinTable;
      query.tables.push(table);
      return table;
    }
  }

  findOrCreateOneToOneJoin(query: ParsedFindQuery, from: string, field: OneToOneField): JoinTable {
    const { tableName } = field.otherMetadata();
    const col1 = kqDot(from, "id");
    const columnName = field.otherMetadata().allFields[field.otherFieldName].serde!.columns[0].columnName;
    const existing = query.tables.find((t) => {
      const col2 = kqDot(t.alias, columnName);
      return (
        t.join === "inner" &&
        t.table === tableName &&
        ((t.col1 === col1 && t.col2 === col2) || (t.col1 === col2 && t.col2 === col1))
      );
    });
    if (existing) {
      return existing as JoinTable;
    } else {
      const alias = this.getAlias(tableName);
      const col2 = kqDot(alias, columnName);
      const table = { alias, table: tableName, join: "inner", col1, col2 } satisfies JoinTable;
      query.tables.push(table);
      return table;
    }
  }
}
