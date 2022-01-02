import { ConnectionConfig } from "pg";
import { parse } from "pg-connection-string";

type DatabaseUrl = { DATABASE_URL: string };
type DbSettings = { DB_USER: string; DB_PASSWORD: string; DB_HOST: string; DB_DATABASE: string; DB_PORT: string };

export type ConnectionEnv = DatabaseUrl | DbSettings;

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
    const url = process.env.DATABASE_URL ?? (env as DatabaseUrl).DATABASE_URL;
    // It'd be great if `parse` returned ConnectionConfig directly
    const options = parse(url);
    const { database, port, host, user, password } = options;
    return {
      user,
      password,
      database: database ?? undefined,
      host: host ?? undefined,
      port: port ? Number(port) : undefined,
    };
  } else if (process.env.DB_DATABASE || (env && "DB_DATABASE" in env)) {
    const e = process.env.DB_DATABASE ? process.env : (env as DbSettings);
    return {
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      database: e.DB_DATABASE,
      host: e.DB_HOST,
      port: e.DB_PORT ? Number(e.DB_PORT) : undefined,
    };
  } else {
    throw new Error("No DATABASE_URL or DB_DATABASE/etc. environment variable found");
  }
}
