import { abbreviation } from "./QueryBuilder";
import { ParsedFindQuery } from "./QueryParser";

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
}
