import { promises as fs } from "fs";
import isPlainObject from "is-plain-object";
import { dirname } from "path";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";

/** A super-simple file system abstraction for testing. */
export interface Fs {
  load(fileName: string): Promise<string | undefined>;
  save(fileName: string, content: string): Promise<void>;
  exists(fileName: string): Promise<boolean>;
}

/** A real implementation of `Fs` that writes to the `prefix` directory. */
export function newFsImpl(prefix: string): Fs {
  return {
    exists: async (fileName) => {
      try {
        // For some reason fs.exists doesn't exist, so use a read
        await fs.readFile(`${prefix}/${fileName}`);
        return true;
      } catch {
        return false;
      }
    },
    load: async (fileName) => {
      try {
        return (await fs.readFile(`${prefix}/${fileName}`)).toString();
      } catch (e) {
        // Hacky way of handling file does not exist
        return undefined;
      }
    },
    save: async (fileName, content) => {
      const path = `${prefix}/${fileName}`;
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content);
    },
  };
}

export function sortKeys<T extends object>(o: T): T {
  return Object.keys(o)
    .sort()
    .reduce((acc, key) => {
      const value = o[key as keyof T];
      const newValue =
        typeof value === "object" && isPlainObject(value)
          ? sortKeys((value as any) as object)
          : Array.isArray(value)
          ? value.sort()
          : value;
      acc[key as keyof T] = newValue as any;
      return acc;
    }, ({} as any) as T);
}
