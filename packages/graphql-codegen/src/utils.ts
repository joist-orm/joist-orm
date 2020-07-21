import { promises as fs } from "fs";
import isPlainObject from "is-plain-object";

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

export function sortKeys<T extends object>(o: T): T {
  return Object.keys(o)
    .sort()
    .reduce((acc, key) => {
      const value = o[key as keyof T];
      const newValue = typeof value === "object" && isPlainObject(value) ? sortKeys((value as any) as object) : value;
      acc[key as keyof T] = newValue as any;
      return acc;
    }, ({} as any) as T);
}
