import { promises as fs } from "fs";

/** A super-simple file system abstraction for testing. */
export interface Fs {
  load(fileName: string): Promise<string | undefined>;
  save(fileName: string, content: string): Promise<void>;
}

/** A real implementatoin of `Fs` that writes to the `prefix` directory. */
export function newFsImpl(prefix: string): Fs {
  return {
    load: async (fileName) => {
      try {
        return (await fs.readFile(`${prefix}/${fileName}`)).toString();
      } catch (e) {
        // Hacky way of handling file does not exist
        return undefined;
      }
    },
    save: async (fileName, content) => {
      await fs.writeFile(`${prefix}/${fileName}`, content);
    },
  };
}
