import { createFromBuffer } from "@dprint/formatter";
import { getBuffer } from "@dprint/json";
import { promises as fs } from "fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { config } from "./config";

const jsonFormatter = createFromBuffer(getBuffer());

async function main() {
  const jsonSchema = zodToJsonSchema(config, "mySchema");
  const content = jsonFormatter.formatText("test.json", JSON.stringify(jsonSchema));
  await fs.writeFile("./config-json-schema.json", content);
}

main();
