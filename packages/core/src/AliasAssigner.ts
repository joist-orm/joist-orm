import { ParsedFindQuery } from "./QueryParser";
import { abbreviation } from "./utils";

export class AliasAssigner {
  #aliases: Record<string, number> = {};

  constructor(query?: ParsedFindQuery) {
    this.getAlias = this.getAlias.bind(this);
    this.getLiteralAlias = this.getLiteralAlias.bind(this);
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

  /** Returns an abbreviated alias for a table name, e.g. `"books"` → `"b"`, `"book_reviews"` → `"br"`. */
  getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    return this.#nextAlias(abbrev);
  }

  /** Returns an alias using the name as-is (no abbreviation), e.g. `"prequel"` → `"prequel"`. */
  getLiteralAlias(name: string): string {
    return this.#nextAlias(name);
  }

  #nextAlias(key: string): string {
    const i = this.#aliases[key] || 0;
    this.#aliases[key] = i + 1;
    return i === 0 ? key : `${key}${i}`;
  }
}
