/** A type for the JSON secrets created by CloudFormation for RDS users. */
import { config } from "dotenv";

// TODO Remove this b/c it's an application framework style thing.

const inDocker = process.env.STAGE === "docker";
const inLocal = process.env.STAGE === "local";

// Both our non-docker tests and our migration script need help loading the local env.
if (inLocal) {
  config({ path: "./env.local" });
}
