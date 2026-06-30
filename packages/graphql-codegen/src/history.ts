import { createFromBuffer } from "@dprint/formatter";
import { getPath } from "@dprint/json";
import { readFileSync } from "fs";
import { Fs, sortKeys } from "./utils";

/** A map from GraphQL object type name -> its field names that have already been scaffolded. */
export type History = Record<string, string[]>;

const jsonFormatter = createFromBuffer(readFileSync(getPath()));
const configPath = ".history.json";

export async function loadHistory(fs: Fs): Promise<History> {
  const content = await fs.load(configPath);
  return content ? JSON.parse(content.toString()) : {};
}

export async function writeHistory(fs: Fs, history: History): Promise<void> {
  const input = JSON.stringify(sortKeys(history));
  const content = jsonFormatter.formatText({ filePath: "test.json", fileText: input });
  await fs.save(configPath, content);
}
