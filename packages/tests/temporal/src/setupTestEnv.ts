import { GetEnvVars } from "env-cmd";

export default async function globalSetup() {
  process.env.DEBUG = "knex:query,knex:bindings";
  Object.entries(await GetEnvVars()).forEach(([key, value]) => (process.env[key] = value));
}
