import { fail } from "./utils";

let runtimeConfig: RuntimeConfig | undefined = undefined;

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig ?? fail("setRuntimeConfig in metadata.ts has not been invoked yet");
}

/**
 * Holds any `joist-config.json` values that we want to access at runtime.
 */
export type RuntimeConfig = {
  temporal:
    | false
    | {
        /** The application's default time zone, i.e. when we say "now", and store it as yyyy-MM-dd, what time zone should we use? */
        timeZone: string;
      };
};

/**
 * Called by the code-generated `metadata.ts` to pass along `joist-config.json` values.
 *
 * This avoids having to load/parse/ship the `joist-config.json` file at runtime.
 */
export function setRuntimeConfig(config: RuntimeConfig) {
  runtimeConfig = config;
}
