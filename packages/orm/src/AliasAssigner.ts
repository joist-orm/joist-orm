import { abbreviation } from "./QueryBuilder";

export class AliasAssigner {
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
