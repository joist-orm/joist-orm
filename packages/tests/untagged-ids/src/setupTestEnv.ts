import { GetEnvVars } from "env-cmd";

export default async function globalSetup() {
  Object.entries(await GetEnvVars()).forEach(([key, value]) => (process.env[key] = value));
}
