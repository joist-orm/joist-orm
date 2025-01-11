import { abbreviation } from "./QueryBuilder";
import { CteJoinTable, ParsedFindQuery, ParsedTable } from "./QueryParser";
import { fail } from "./utils";

export class AliasAssigner {
  #aliases: Record<string, number> = {};
  #tables: Record<string, ParsedTable> = {};
  #ctes: Record<string, CteJoinTable[]> = {};

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

  getCtes(alias: string): CteJoinTable[] {
    return this.#ctes[alias] || fail(`No CTEs found for alias ${alias}`);
  }

  getCtePath(alias: string): string[] {
    return this.getCtes(alias).map((cte) => cte.alias);
  }

  setTable(alias: string, table: ParsedTable, ctes: CteJoinTable[]): void {
    this.#tables[alias] = table;
    this.#ctes[alias] = ctes;
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

// function getAlias(tableName: string): string {
//   const abbrev = abbreviation(tableName);
//   const i = aliases[abbrev] || 0;
//   aliases[abbrev] = i + 1;
//   return i === 0 ? abbrev : `${abbrev}${i}`;
// }
