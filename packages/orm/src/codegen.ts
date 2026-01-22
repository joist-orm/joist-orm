import { joistCodegen, maybeSetExitCode } from "joist-codegen";

// Re-export everything from joist-codegen
export * from "joist-codegen";

// Duplicate the `require.main` check from joist-codegen
if (require.main === module) {
  joistCodegen()
    .then(() => maybeSetExitCode())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
