/** A type for the JSON secrets created by CloudFormation for RDS users. */
import { ConnectionConfig } from "pg";
import { config } from "dotenv";

// TODO Remove this b/c it's an application framework style thing.

const inDocker = process.env.STAGE === "docker";
const inLocal = process.env.STAGE === "local";

// Both our non-docker tests and our migration script need help loading the local env.
if (inLocal) {
  config({ path: "./env.local" });
}

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
