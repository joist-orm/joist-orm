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
} from "./drivers/binaryParsers.js";
export { PostgresDriver, PostgresDriverOpts, setupLatestPgTypes } from "./drivers/PostgresDriver.js";
export { seed } from "./seed.js";
