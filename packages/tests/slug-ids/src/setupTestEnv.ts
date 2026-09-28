import { GetEnvVars } from "env-cmd";

/** Loads the fixture's database URL before Jest initializes its test environment. */
export default async function globalSetup() {
  Object.entries(await GetEnvVars()).forEach(([key, value]) => (process.env[key] = value));
}
