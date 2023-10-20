/** Keeps track of table aliases, i.e. `book_reviews` -> `br`, within a single query. */
export class AliasAssigner {
  static findOrCreate(args: object[]): AliasAssigner {
    return new AliasAssigner();
  }

  #aliases: Record<string, number> = {};

  constructor() {
    this.getAlias = this.getAlias.bind(this);
  }

  getAlias(tableName: string): string {
    const abbrev = abbreviation(tableName);
    const i = this.#aliases[abbrev] || 0;
    this.#aliases[abbrev] = i + 1;
    return i === 0 ? abbrev : `${abbrev}${i}`;
  }
}

export function abbreviation(tableName: string): string {
  return tableName
    .split("_")
    .map((w) => w[0])
    .join("");
}
