import { ManyToOneField } from "./EntityMetadata";
import { abbreviation } from "./QueryBuilder";
import { JoinTable, ParsedFindQuery } from "./QueryParser";
import { kqDot } from "./keywords";

export class AliasAssigner {
  #aliases: Record<string, number> = {};

  constructor(query?: ParsedFindQuery) {
    this.getAlias = this.getAlias.bind(this);
    this.findOrCreateJoin = this.findOrCreateJoin.bind(this);
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
  findOrCreateJoin(query: ParsedFindQuery, from: string, field: ManyToOneField): JoinTable {
    const newMeta = field.otherMetadata();
    const col1 = kqDot(from, field.serde.columns[0].columnName);

    const existing = query.tables.find((t) => {
      const col2 = kqDot(t.alias, "id");
      return (
        t.table === newMeta.tableName &&
        t.join === "inner" &&
        ((t.col1 === col1 && t.col2 === col2) || (t.col1 === col2 && t.col2 === col1))
      );
    });
    if (existing) return existing as JoinTable;

    const alias = this.getAlias(newMeta.tableName);
    const col2 = kqDot(alias, "id");
    const table = { alias, table: newMeta.tableName, join: "inner", col1, col2 } satisfies JoinTable;
    query.tables.push(table);
    return table;
  }
}
