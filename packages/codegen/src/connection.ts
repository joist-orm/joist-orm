import { ConnectionConfig } from "pg";

export interface ConnectionInfo {
  dbname: string;
  username: string;
  password: string;
  host: string;
  port: number;
}

/** Reads the RDS-style connection information from `process.env`. */
export function newConnectionInfo(): ConnectionInfo {
  return JSON.parse(process.env.DATABASE_CONNECTION_INFO!) as ConnectionInfo;
}

/** Converts the RDS-style connection information from `process.env` into pg's `ConnectionConfig`. */
export function newPgConnectionConfig(): ConnectionConfig {
  const connInfo = newConnectionInfo();
  const { dbname: database, username: user, password, host, port } = connInfo;
  return { database, user, password, host, port };
}
