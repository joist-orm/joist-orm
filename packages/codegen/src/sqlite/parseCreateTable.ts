/**
 * Parse CREATE TABLE SQL statements to extract declared column types and constraints.
 *
 * SQLite's PRAGMA commands return type affinity (INTEGER, TEXT, etc.), not the
 * declared types (VARCHAR(255), DATETIME, etc.). We need the declared types
 * for accurate TypeScript type mapping.
 */

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  primaryKey: string[];
  foreignKeys: ParsedForeignKey[];
  uniqueConstraints: ParsedUniqueConstraint[];
}

export interface ParsedColumn {
  name: string;
  /** The full declared type, e.g., "VARCHAR(255)" */
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
}

export interface ParsedForeignKey {
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
  /** The constraint name, if specified */
  name?: string;
  isDeferrable: boolean;
  isDeferred: boolean;
}

export interface ParsedUniqueConstraint {
  name?: string;
  columns: string[];
}

/**
 * Parse a CREATE TABLE statement to extract column definitions and constraints.
 */
export function parseCreateTable(sql: string): ParsedTable {
  const tableName = extractTableName(sql);
  const columnDefs = extractColumnDefinitions(sql);
  const tableConstraints = extractTableConstraints(sql);

  const columns: ParsedColumn[] = [];
  const inlineForeignKeys: ParsedForeignKey[] = [];
  const inlinePrimaryKey: string[] = [];
  const inlineUnique: ParsedUniqueConstraint[] = [];

  for (const colDef of columnDefs) {
    const parsed = parseColumnDef(colDef);
    columns.push(parsed.column);
    if (parsed.foreignKey) {
      inlineForeignKeys.push(parsed.foreignKey);
    }
    if (parsed.column.isPrimaryKey) {
      inlinePrimaryKey.push(parsed.column.name);
    }
    if (parsed.isUnique) {
      inlineUnique.push({ columns: [parsed.column.name] });
    }
  }

  const tablePrimaryKey = extractPrimaryKeyConstraint(tableConstraints);
  const tableForeignKeys = extractForeignKeyConstraints(tableConstraints);
  const tableUniqueConstraints = extractUniqueConstraints(tableConstraints);

  return {
    name: tableName,
    columns,
    primaryKey: tablePrimaryKey.length > 0 ? tablePrimaryKey : inlinePrimaryKey,
    foreignKeys: [...inlineForeignKeys, ...tableForeignKeys],
    uniqueConstraints: [...inlineUnique, ...tableUniqueConstraints],
  };
}

function extractTableName(sql: string): string {
  // Match quoted table names (with any characters inside) or unquoted identifiers
  const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`]([^"'`]+)["'`]|(\w+))/i);
  return match?.[1] ?? match?.[2] ?? "";
}

function extractColumnDefinitions(sql: string): string[] {
  // Find content between first ( and last )
  const start = sql.indexOf("(");
  const end = sql.lastIndexOf(")");
  if (start === -1 || end === -1) return [];

  const content = sql.slice(start + 1, end);

  // Split by comma, but respect parentheses (for types like DECIMAL(10,2))
  const defs: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of content) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) defs.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) defs.push(trimmed);

  // Filter out table-level constraints (start with PRIMARY KEY, FOREIGN KEY, etc.)
  return defs.filter((def) => !isTableConstraint(def));
}

function extractTableConstraints(sql: string): string[] {
  const start = sql.indexOf("(");
  const end = sql.lastIndexOf(")");
  if (start === -1 || end === -1) return [];

  const content = sql.slice(start + 1, end);
  const defs: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of content) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) defs.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) defs.push(trimmed);

  return defs.filter((def) => isTableConstraint(def));
}

function isTableConstraint(def: string): boolean {
  const upper = def.toUpperCase().trim();
  return (
    upper.startsWith("PRIMARY KEY") ||
    upper.startsWith("FOREIGN KEY") ||
    upper.startsWith("UNIQUE") ||
    upper.startsWith("CHECK") ||
    upper.startsWith("CONSTRAINT")
  );
}

interface ParsedColumnResult {
  column: ParsedColumn;
  foreignKey?: ParsedForeignKey;
  isUnique: boolean;
}

function parseColumnDef(def: string): ParsedColumnResult {
  const tokens = tokenize(def);
  if (tokens.length === 0) {
    return {
      column: { name: "", type: "text", notNull: false, defaultValue: null, isPrimaryKey: false, isAutoIncrement: false },
      isUnique: false,
    };
  }

  const name = unquote(tokens[0]);
  let type = "text";
  let notNull = false;
  let defaultValue: string | null = null;
  let isPrimaryKey = false;
  let isAutoIncrement = false;
  let isUnique = false;
  let foreignKey: ParsedForeignKey | undefined;

  let i = 1;

  // Type (optional in SQLite)
  if (i < tokens.length && !isConstraintKeyword(tokens[i])) {
    type = tokens[i];
    i++;
    // Handle types with parentheses like VARCHAR(255) or DECIMAL(10,2)
    if (i < tokens.length && tokens[i] === "(") {
      type += tokens[i];
      i++;
      while (i < tokens.length && tokens[i - 1] !== ")") {
        type += tokens[i];
        i++;
      }
    }
  }

  // Parse constraints
  while (i < tokens.length) {
    const token = tokens[i].toUpperCase();

    if (token === "NOT" && tokens[i + 1]?.toUpperCase() === "NULL") {
      notNull = true;
      i += 2;
    } else if (token === "NULL") {
      notNull = false;
      i++;
    } else if (token === "PRIMARY" && tokens[i + 1]?.toUpperCase() === "KEY") {
      isPrimaryKey = true;
      i += 2;
      if (tokens[i]?.toUpperCase() === "AUTOINCREMENT") {
        isAutoIncrement = true;
        i++;
      }
    } else if (token === "AUTOINCREMENT") {
      isAutoIncrement = true;
      i++;
    } else if (token === "UNIQUE") {
      isUnique = true;
      i++;
    } else if (token === "DEFAULT") {
      i++;
      if (i < tokens.length) {
        defaultValue = tokens[i];
        // Handle parenthesized defaults like DEFAULT (datetime('now'))
        if (defaultValue === "(") {
          defaultValue = "(";
          i++;
          let depth = 1;
          while (i < tokens.length && depth > 0) {
            if (tokens[i] === "(") depth++;
            if (tokens[i] === ")") depth--;
            defaultValue += tokens[i];
            i++;
          }
        } else {
          i++;
        }
      }
    } else if (token === "REFERENCES") {
      i++;
      if (i < tokens.length) {
        const refTable = unquote(tokens[i]);
        i++;
        const refColumns: string[] = [];
        if (tokens[i] === "(") {
          i++;
          while (i < tokens.length && tokens[i] !== ")") {
            if (tokens[i] !== ",") {
              refColumns.push(unquote(tokens[i]));
            }
            i++;
          }
          i++; // skip )
        }

        let onDelete = "NO ACTION";
        let onUpdate = "NO ACTION";
        let isDeferrable = false;
        let isDeferred = false;

        while (i < tokens.length) {
          const t = tokens[i].toUpperCase();
          if (t === "ON" && tokens[i + 1]?.toUpperCase() === "DELETE") {
            i += 2;
            onDelete = parseAction(tokens, i);
            i += onDelete.split(" ").length;
          } else if (t === "ON" && tokens[i + 1]?.toUpperCase() === "UPDATE") {
            i += 2;
            onUpdate = parseAction(tokens, i);
            i += onUpdate.split(" ").length;
          } else if (t === "DEFERRABLE") {
            isDeferrable = true;
            i++;
            if (tokens[i]?.toUpperCase() === "INITIALLY") {
              i++;
              if (tokens[i]?.toUpperCase() === "DEFERRED") {
                isDeferred = true;
                i++;
              } else if (tokens[i]?.toUpperCase() === "IMMEDIATE") {
                i++;
              }
            }
          } else if (t === "NOT" && tokens[i + 1]?.toUpperCase() === "DEFERRABLE") {
            i += 2;
          } else {
            break;
          }
        }

        foreignKey = {
          columns: [name],
          referencedTable: refTable,
          referencedColumns: refColumns.length > 0 ? refColumns : ["id"],
          onDelete,
          onUpdate,
          isDeferrable,
          isDeferred,
        };
      }
    } else {
      i++;
    }
  }

  return {
    column: { name, type, notNull, defaultValue, isPrimaryKey, isAutoIncrement },
    foreignKey,
    isUnique,
  };
}

function parseAction(tokens: string[], i: number): string {
  const t = tokens[i]?.toUpperCase();
  if (t === "CASCADE") return "CASCADE";
  if (t === "RESTRICT") return "RESTRICT";
  if (t === "SET" && tokens[i + 1]?.toUpperCase() === "NULL") return "SET NULL";
  if (t === "SET" && tokens[i + 1]?.toUpperCase() === "DEFAULT") return "SET DEFAULT";
  if (t === "NO" && tokens[i + 1]?.toUpperCase() === "ACTION") return "NO ACTION";
  return "NO ACTION";
}

function extractPrimaryKeyConstraint(constraints: string[]): string[] {
  for (const constraint of constraints) {
    const upper = constraint.toUpperCase();
    if (upper.startsWith("PRIMARY KEY") || (upper.startsWith("CONSTRAINT") && upper.includes("PRIMARY KEY"))) {
      const match = constraint.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (match) {
        return match[1].split(",").map((c) => unquote(c.trim()));
      }
    }
  }
  return [];
}

function extractForeignKeyConstraints(constraints: string[]): ParsedForeignKey[] {
  const fks: ParsedForeignKey[] = [];

  for (const constraint of constraints) {
    const upper = constraint.toUpperCase();
    if (!upper.includes("FOREIGN KEY")) continue;

    // Match: [CONSTRAINT name] FOREIGN KEY (cols) REFERENCES table (cols) [ON DELETE ...] [ON UPDATE ...]
    const nameMatch = constraint.match(/CONSTRAINT\s+["'`]?(\w+)["'`]?/i);
    const fkMatch = constraint.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["'`]?(\w+)["'`]?\s*\(([^)]+)\)/i);

    if (fkMatch) {
      const columns = fkMatch[1].split(",").map((c) => unquote(c.trim()));
      const refTable = fkMatch[2];
      const refColumns = fkMatch[3].split(",").map((c) => unquote(c.trim()));

      let onDelete = "NO ACTION";
      let onUpdate = "NO ACTION";
      let isDeferrable = false;
      let isDeferred = false;

      const onDeleteMatch = constraint.match(/ON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i);
      if (onDeleteMatch) onDelete = onDeleteMatch[1].toUpperCase();

      const onUpdateMatch = constraint.match(/ON\s+UPDATE\s+(CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i);
      if (onUpdateMatch) onUpdate = onUpdateMatch[1].toUpperCase();

      if (upper.includes("DEFERRABLE")) {
        isDeferrable = true;
        if (upper.includes("INITIALLY DEFERRED")) {
          isDeferred = true;
        }
      }

      fks.push({
        name: nameMatch?.[1],
        columns,
        referencedTable: refTable,
        referencedColumns: refColumns,
        onDelete,
        onUpdate,
        isDeferrable,
        isDeferred,
      });
    }
  }

  return fks;
}

function extractUniqueConstraints(constraints: string[]): ParsedUniqueConstraint[] {
  const uniques: ParsedUniqueConstraint[] = [];

  for (const constraint of constraints) {
    const upper = constraint.toUpperCase();
    if (!upper.startsWith("UNIQUE") && !(upper.startsWith("CONSTRAINT") && upper.includes("UNIQUE"))) continue;

    const nameMatch = constraint.match(/CONSTRAINT\s+["'`]?(\w+)["'`]?/i);
    const colMatch = constraint.match(/UNIQUE\s*\(([^)]+)\)/i);

    if (colMatch) {
      const columns = colMatch[1].split(",").map((c) => unquote(c.trim()));
      uniques.push({ name: nameMatch?.[1], columns });
    }
  }

  return uniques;
}

function tokenize(sql: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inString: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (inString) {
      current += char;
      if (char === inString) {
        // Check for escaped quote
        if (sql[i + 1] === inString) {
          current += sql[i + 1];
          i++;
        } else {
          tokens.push(current);
          current = "";
          inString = null;
        }
      }
    } else if (char === '"' || char === "'" || char === "`") {
      if (current) tokens.push(current);
      current = char;
      inString = char;
    } else if (char === "(" || char === ")" || char === ",") {
      if (current) tokens.push(current);
      tokens.push(char);
      current = "";
    } else if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current) tokens.push(current);
  return tokens;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) || (s.startsWith("`") && s.endsWith("`"))) {
    return s.slice(1, -1);
  }
  return s;
}

function isConstraintKeyword(token: string): boolean {
  const upper = token.toUpperCase();
  return ["NOT", "NULL", "PRIMARY", "UNIQUE", "CHECK", "DEFAULT", "REFERENCES", "CONSTRAINT", "COLLATE", "GENERATED"].includes(
    upper,
  );
}
