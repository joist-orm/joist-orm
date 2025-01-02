import { abbreviation } from "./QueryBuilder";
import { ParsedFindQuery } from "./QueryParser";

export class AliasAssigner {
  #aliases: Record<string, number> = {};

  constructor(query?: ParsedFindQuery) {
    this.getAlias = this.getAlias.bind(this);
    // If we're assigning aliases into an existing query, get the current assignments
    if (query) {
      const todo = [query];
      while (todo.length > 0) {
        const query = todo.pop()!;
        for (const table of query.tables) {
          // Ignore CTI base/sub aliases
          if (table.alias.includes("_")) continue;
          if (table.join === "lateral") {
            this.maybeBumpIndex(table.table, table.alias);
            todo.push(table.query);
          } else {
            this.maybeBumpIndex(table.table, table.alias);
          }
        }
      }
    }
  }

  getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = this.#aliases[abbrev] || 0;
    this.#aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }

  /** Given an existing alias, like `a5`, make sure our internal `a = N` is at least 5 or higher. */
  private maybeBumpIndex(tableName: string, alias: string): void {
    const tag = abbreviation(tableName);
    const ourN = this.#aliases[tag] || 0;
    // Recover the `5` out of `pi5` by stripping the `pi` prefix
    const newN = Number(alias.replace(tag, "")) + 1;
    this.#aliases[tag] = Math.max(ourN, newN);
  }
}
