import { GetEnvVars } from "env-cmd";

export default async function globalSetup() {
  process.env.TZ = "UTC";
  process.env.DEBUG = "knex:query,knex:bindings";
  // process.env.DEBUG = "knex:*";
  Object.entries(await GetEnvVars()).forEach(([key, value]) => (process.env[key] = value));
}
