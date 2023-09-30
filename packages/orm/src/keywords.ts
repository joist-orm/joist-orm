const keywords = [
  "all",
  "alter",
  "and",
  "as",
  "asc",
  "avg",
  "between",
  "by",
  "case",
  "count",
  "create",
  "delete",
  "desc",
  "distinct",
  "drop",
  "else",
  "end",
  "from",
  "group",
  "having",
  "in",
  "inner",
  "insert",
  "into",
  "is",
  "join",
  "left",
  "like",
  "max",
  "min",
  "not",
  "null",
  "on",
  "or",
  "order",
  "outer",
  "right",
  "select",
  "set",
  "sum",
  "table",
  "then",
  "union",
  "update",
  "values",
  "when",
  "where",
];

// Cache all keywords => their escaped equivalent
const escapeMapped = new Map(keywords.map((k) => [k, `"${k}"`]));

/** Conditionally quotes `alias` if it's a SQL keyword. */
export function kq(alias: string): string {
  return escapeMapped.get(alias) ?? alias;
}

export function kqDot(alias: string, column: string): string {
  return `${kq(alias)}.${kq(column)}`;
}
