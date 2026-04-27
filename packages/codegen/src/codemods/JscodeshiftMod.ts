import fastglob from "fast-glob";
import { run as jscodeshift } from "jscodeshift/src/Runner";
import path from "path";
import { type Config } from "../config";
import { type Codemod } from "./Codemod";

export class JscodeshiftMod implements Codemod {
  constructor(
    public codemodVersion: number,
    public name: string,
    public description: string,
    private glob: (config: Config) => string = defaultGlob,
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

/** Returns the default source tree for project-wide codemods. */
function defaultGlob(config: Config): string {
  return `${path.dirname(config.entitiesDirectory)}/**/*.ts`;
}
