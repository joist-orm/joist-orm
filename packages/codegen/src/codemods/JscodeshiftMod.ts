import fastglob from "fast-glob";
import { run as jscodeshift } from "jscodeshift/src/Runner";
import path from "path";
import { Config } from "../config";
import { Codemod } from "./Codemod";

export class JscodeshiftMod implements Codemod {
  constructor(
    public version: string,
    public name: string,
    public description: string,
    private glob: (config: Config) => string,
  ) {}

  async run(config: Config): Promise<void> {
    const glob = this.glob(config);
    const transformPath = path.resolve(`${__dirname}/${this.name}.js`);
    const paths = await fastglob(glob);
    console.log(`Running ${transformPath} against ${paths.length} files`);
    console.log(`There will be a lot of jscodeshift output after this...\n\n\n`);
    await jscodeshift(transformPath, paths, {
      verbose: true,
      parser: "ts",
    });
  }
}
