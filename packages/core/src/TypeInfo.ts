// Keep compatibility metadata a runtime leaf in both CJS and ESM builds.
import type { EntityMetadata } from "./EntityMetadata.ts";

/**
 * Runtime proof that values can share scalar conversions.
 *
 * PostgreSQL compares projected SQL rows and chooses a common SQL type before Joist decodes them.
 * A compound uses one decoder per output column and retains an encoder for later comparisons and
 * coalesce fallbacks. TypeScript result types are erased, and equal SQL storage types do not imply
 * equal logical domains.
 *
 * I.e. Author.id and Book.author_id are compatible Author IDs despite having separate serdes, while
 * Book.id must not decode as an Author ID just because both use int4. Author.age and Author.age.sum()
 * both expose TypeScript numbers but produce int4 and int8 driver values. Enum, custom-mapper, and
 * JSON-schema domain tokens also prevent unrelated conversions from mixing.
 *
 * Compatibility requires exact equality of canonical `dbType`, `domain`, and `idMeta`. An absent
 * descriptor is unknown, not an identity codec. `idMeta` identifies scalar IDs only; arrays retain
 * their element domain separately so they cannot select a polymorphic IN component. Raw `sql<R>`
 * annotations supply no runtime evidence. This descriptor does not implement conversions.
 */
export interface TypeInfo {
  dbType: string;
  domain: unknown;
  idMeta?: EntityMetadata;
  /** Internal conversion proof, consistent for equal dbType/domain/idMeta; not another compatibility key. */
  arrayElementSafe?: boolean;
}

/**
 * Normalizes known PostgreSQL type synonyms without treating coercible types or user types as equal.
 * The output compatibility checks compare these names, so normalize only spellings of the same type.
 *
 * I.e. `integer` and `int` both mean `int4`; `integer[]` and `int4[]` also describe the same SQL type.
 * Keeping these spellings distinct would reject compatible outputs just because their serdes use
 * different names for the same representation.
 *
 * I.e. `int4` can be promoted to `int8`, but they are not synonyms: classic pg returns int4 as a number
 * and int8 as a string. Treating them as equal could admit a compound whose first operand's decoder
 * cannot handle the common SQL type. This function does not choose or apply a conversion.
 *
 * I.e. `citext` must stay distinct from `text`: they disagree on whether 'Alice' and 'alice' are equal,
 * which matters when a set operation compares rows. A user-defined `app.email` domain over text can
 * also impose constraints that text does not. Unknown names remain unchanged, including their schema
 * and quoting; neither coercibility nor a shared base type proves that their outputs are compatible.
 */
export function canonicalDbType(dbType: string): string {
  if (dbType.endsWith("[]")) return `${canonicalDbType(dbType.slice(0, -2))}[]`;
  switch (dbType) {
    case "smallint":
      return "int2";
    case "int":
    case "integer":
      return "int4";
    case "bigint":
      return "int8";
    case "decimal":
      return "numeric";
    case "real":
      return "float4";
    case "double precision":
      return "float8";
    case "boolean":
      return "bool";
    case "character varying":
      return "varchar";
    case "character":
      return "bpchar";
    case "timestamp without time zone":
      return "timestamp";
    case "timestamp with time zone":
      return "timestamptz";
    case "time without time zone":
      return "time";
    case "time with time zone":
      return "timetz";
    default:
      return dbType;
  }
}

const arrayDomains = new Map<unknown, Map<EntityMetadata | undefined, symbol>>();

// Both classic pg and lazy binary reads decode these physical arrays, not an unparsed array string.
const arrayElementDbTypes = new Set([
  "bool",
  "bytea",
  "int2",
  "int4",
  "int8",
  "float4",
  "float8",
  "numeric",
  "text",
  "varchar",
  "bpchar",
  "uuid",
  "json",
  "jsonb",
]);

/**
 * Describes elementwise conversion only for known physical array parsers and stable domain conversion.
 *
 * I.e. `a.id.arrayAgg()` wraps Author's tag and `idMeta` in its domain token, but has no scalar
 * `idMeta` of its own. Repeated expressions share the token; IDs of subtypes with a shared tag do not.
 * Native enum/citext, date/time, and nested SQL arrays remain unknown. Numeric elements can be numbers
 * in classic pg and strings in lazy binary reads, so a scalar string-only mapper is not sufficient.
 */
export function arrayOutputType(outputType: TypeInfo | undefined): TypeInfo | undefined {
  if (!outputType?.arrayElementSafe || !arrayElementDbTypes.has(outputType.dbType)) return undefined;
  let domains = arrayDomains.get(outputType.domain);
  if (!domains) arrayDomains.set(outputType.domain, (domains = new Map()));
  let domain = domains.get(outputType.idMeta);
  if (!domain) domains.set(outputType.idMeta, (domain = Symbol("joist.arrayOutput")));
  return { dbType: `${outputType.dbType}[]`, domain };
}
