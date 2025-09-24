import { getMetadata, InstanceData } from "joist-orm";
import { Author } from "src/entities";

async function main() {
  const mitata = await import("mitata");
  const { run, bench } = mitata;
  const meta = getMetadata(Author);

  bench("Object.create with prop", () => {
    Object.create(Author.prototype, {
      __data: {
        value: new InstanceData(null!, meta, true),
        enumerable: false,
        writable: false,
        configurable: false,
      },
    });
  });

  bench("Object.create only value", () => {
    Object.create(Author.prototype, {
      __data: {
        value: new InstanceData(null!, meta, true),
      },
    });
  });

  bench("Object.create defineProperty", () => {
    const author = Object.create(Author.prototype);
    Object.defineProperty(author, "__data", {
      value: new InstanceData(null!, meta, true),
    });
  });

  bench("Object.setPrototypeOf", () => {
    const entity = { __data: new InstanceData(null!, meta, true) };
    Object.setPrototypeOf(entity, Author.prototype);
  });

  bench("Object.setPrototypeOf defineProperty", () => {
    const entity = {};
    Object.setPrototypeOf(entity, Author.prototype);
    Object.defineProperty(entity, "__data", {
      value: new InstanceData(null!, meta, true),
    });
  });

  bench("new Author", () => {
    new (Author as any)(null!, true);
  });

  await run({});
}

// yarn clinic flame -- node --env-file .env --import=tsx ./src/benchmarks/loading-authors.ts
// yarn env-cmd tsx ./src/benchmarks/loading-authors.ts
// bun src/saving-authors.ts
main();
