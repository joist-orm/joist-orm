import { ConnectionConfig } from "pg";
import { fail } from "./utils";

export interface ConnectionInfo {
  dbname: string;
  username: string;
  password: string;
  host: string;
  port: number;
}

/** Reads the RDS-style connection information from `process.env`. */
function newConnectionInfo(): ConnectionInfo {
  const info = process.env.DATABASE_CONNECTION_INFO || fail("DATABASE_CONNECTION_INFO environment variable is not set");
  return JSON.parse(info) as ConnectionInfo;
}

/** Converts the RDS-style connection information from `process.env` into pg's `ConnectionConfig`. */
export function newPgConnectionConfig(): ConnectionConfig {
  const connInfo = newConnectionInfo();
  const { dbname: database, username: user, password, host, port } = connInfo;
  return { database, user, password, host, port };
}
