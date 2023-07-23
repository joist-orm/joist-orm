import { GetEnvVars } from "env-cmd";

export default async function globalSetup() {
  process.env.TZ = "UTC";
  Object.entries(await GetEnvVars()).forEach(([key, value]) => (process.env[key] = value));
}
