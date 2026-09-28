// Note the lazy-rows internals (WireRowData, executeRowDataQuery, ensureLazyDataRows,
// LazyDataRowMessage, isRowDataCapableClient) are deliberately not exported: they are
// implementation details of `lazyRows`, not public API. The binary parser registry is the
// supported extension point.
export {
  type BinaryParse,
  binaryArrayParser,
  binaryTextParser,
  getBinaryTypeParser,
  registerDatabaseBinaryParsers,
  setBinaryTypeParser,
  setSessionTimeZone,
} from "./drivers/binaryParsers.ts";
export { PostgresDriver, type PostgresDriverOpts, setupLatestPgTypes } from "./drivers/PostgresDriver.ts";
export { seed } from "./seed.ts";
