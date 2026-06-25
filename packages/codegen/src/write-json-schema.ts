import { createFromBuffer } from "@dprint/formatter";
import { getPath } from "@dprint/json";
import { promises as fs, readFileSync } from "fs";
import { z } from "zod";
import { config } from "./config";

const jsonFormatter = createFromBuffer(readFileSync(getPath()));

async function main() {
  // `io: "input"` since the schema validates the user-authored joist-config.json, and
  // `unrepresentable: "any"` to skip the `uniqueBy` transform that has no JSON Schema form.
  const jsonSchema = z.toJSONSchema(config, { io: "input", unrepresentable: "any" });
  const content = jsonFormatter.formatText({ filePath: "test.json", fileText: JSON.stringify(jsonSchema) });
  await fs.writeFile("./config-json-schema.json", content);
}

main();
