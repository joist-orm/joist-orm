import tls from "node:tls";
import { parse } from "pg-connection-string";

type DatabaseUrlEnv = { DATABASE_URL: string };
type DbSettingsEnv = {
  DB_USER: string;
  DB_PASSWORD: string;
  DB_HOST: string;
  DB_DATABASE: string;
  DB_PORT: string;
  DB_SSL?: string;
};

export type ConnectionEnv = DatabaseUrlEnv | DbSettingsEnv;

/**
 * A simpler connection config.
 *
 * The `pg-connection-string` uses `string | null | undefined` types, and we omit the nulls.
 */
export type ConnectionConfig = {
  host?: string;
  password?: string;
  user?: string;
  port?: number;
  database?: string;
  // pg's ClientConfig uses a definition like:
  //   ssl?: boolean | ConnectionOptions | undefined;
  // postgres's definition is:
  //   ssl?: boolean | "require" | "allow" | "prefer" | "verify-full" | object;
  // It seems like the boolean | ConnectionOptions is the best overlap common
  ssl?: boolean | tls.ConnectionOptions;
};

/**
 * Returns the `ConnectionConfig` that joist will use to connect to pg.
 *
 * This reads environment variables, and can be either:
 *
 * - A single `DATABASE_URL` variable
 * - Multiple `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `DB_HOST`, `DB_PORT` variables
 * The value can be either:
 *
 * Note that users using a library for typed / validated environment variables, i.e.
 * ts-app-env, you can pass in a specific `env` variable.
 */
export function newPgConnectionConfig(env?: ConnectionEnv): ConnectionConfig {
  if (process.env.DATABASE_URL || (env && "DATABASE_URL" in env)) {
    const url = process.env.DATABASE_URL ?? (env as DatabaseUrlEnv).DATABASE_URL;
    // It'd be great if `parse` returned ConnectionConfig directly
    const options = parse(url);
    const { database, port, host, user, password, ssl } = options;
    return {
      user,
      password,
      database: database ?? undefined,
      host: host ?? undefined,
      port: port ? Number(port) : undefined,
      ssl: ssl as any, // skip verifying the string -> type literal checking...
    };
  } else if (process.env.DB_DATABASE || (env && "DB_DATABASE" in env)) {
    const e = process.env.DB_DATABASE ? process.env : (env as DbSettingsEnv);
    return {
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      database: e.DB_DATABASE,
      host: e.DB_HOST,
      port: e.DB_PORT ? Number(e.DB_PORT) : undefined,
      ssl: e.DB_SSL === "1" || e.DB_SSL === "true",
    };
  } else {
    throw new Error("No DATABASE_URL or DB_DATABASE/etc. environment variable found");
  }
}
