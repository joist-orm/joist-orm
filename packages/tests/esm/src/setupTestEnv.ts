import { GetEnvVars } from "env-cmd";
import { toMatchEntity } from "joist-test-utils";

export default async function globalSetup() {
  expect.extend({ toMatchEntity });
  Object.entries(await GetEnvVars()).forEach(([key, value]) => (process.env[key] = value));
}
