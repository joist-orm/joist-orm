import { createFromBuffer } from "@dprint/formatter";
import { getPath } from "@dprint/json";
import { promises as fs } from "fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from "./config";

async function main() {
  const buffer = await fs.readFile(getPath());
  const jsonFormatter = createFromBuffer(buffer);

  const jsonSchema = zodToJsonSchema(config, "mySchema");
  const content = jsonFormatter.formatText("test.json", JSON.stringify(jsonSchema));
  await fs.writeFile("./config-json-schema.json", content);
}

main();
