import fastglob from "fast-glob";
import { run as jscodeshift } from "jscodeshift/src/Runner";
import path from "path";
import semver from "semver";

export async function runTransforms(prevVersion: string, thisVersion: string): Promise<void> {
  console.log({ prevVersion, thisVersion });
  if (!semver.eq(prevVersion, thisVersion)) {
    const todo = transforms.filter((t) => semver.lt(prevVersion, t.version));
    for await (const t of todo) {
      console.log(`Running ${t.name}`);
      const transformPath = path.resolve(`${__dirname}/${t.name}.js`);
      const paths = await fastglob(t.glob);
      console.log(`Found ${transformPath} and ${paths.length} files`);
      const res = await jscodeshift(transformPath, paths, { verbose: true, parser: "ts" });
      console.log(res);
    }
  }
}

type Codemod = { glob: string; version: string; name: string };

const transforms: Codemod[] = [
  {
    version: "1.143.0",
    glob: "src/entities/*.ts",
    name: "v1_143_0_rename_derived_async_property",
  },
];
