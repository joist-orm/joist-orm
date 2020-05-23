import { ConnectionConfig } from "pg";
import { parse } from "pg-connection-string";
import { fail } from "./index";

// Matches the AWS RDS/ECS JSON config that is stored/auto-created in ECS. */
export interface ConnectionInfo {
  dbname: string;
  username: string;
  password: string;
  host: string;
  port: number;
}

function readEnvVariable(): string {
  return process.env.DATABASE_CONNECTION_INFO || fail("DATABASE_CONNECTION_INFO environment variable is not set");
}

/** Reads the RDS-style connection information from `process.env`. */
function parseAsRdsConnectionInfo(envVariable: string): ConnectionConfig | undefined {
  if (envVariable.startsWith("{")) {
    const { dbname: database, username: user, password, host, port } = JSON.parse(envVariable) as ConnectionInfo;
    return { database, user, password, host, port };
  }
  return undefined;
}

/**
 * Returns the `ConnectionConfig` that joist will use to connect to pg.
 *
 * This is currently hard-coded to read the `DATABASE_CONNECTION_INFO` env variable.
 *
 * The value can be either:
 *
 * - RDS-style JSON like `{"dbname":"...","host":"...",...}`
 * - connection-string-style like `postgres://host?...` as read by the `pg-connection-string` `parse` method
 */
export function newPgConnectionConfig(): ConnectionConfig {
  return parsePgConnectionConfig(readEnvVariable());
}

// exported for testing
export function parsePgConnectionConfig(envVariable: string): ConnectionConfig {
  const rdsConfig = parseAsRdsConnectionInfo(envVariable);
  if (rdsConfig) {
    return rdsConfig;
  }
  const opts = parse(envVariable);
  return {
    ...opts,
    // Drop `| null` from the parse return type
    database: opts.database || undefined,
    host: opts.host || undefined,
    port: opts.port !== undefined && opts.port !== null ? Number(opts.port) : undefined,
    ssl:
      typeof opts.ssl === "boolean"
        ? opts.ssl
        : typeof opts.ssl === "string"
        ? fail("parsing string ssl not implemented")
        : undefined,
  };
}
