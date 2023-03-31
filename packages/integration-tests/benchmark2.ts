import { newPgConnectionConfig } from "joist-utils";
import { Client, native } from "pg";

async function main() {
  const { bench, group, run } = await import("mitata");

  const config = newPgConnectionConfig();
  const client = new Client(config);
  await client.connect();
  const client1 = new native!.Client(config);
  await client1.connect();

  group("first", () => {
    bench("javascript", async () => {
      const promises = zeroTo(100).map((i) => {
        return client.query("SELECT 1");
      });
      await Promise.all(promises);
    });

    bench("native", async () => {
      const promises = zeroTo(100).map((i) => {
        return client1.query("SELECT 1");
      });
      await Promise.all(promises);
    });
  });

  await run();
  await client.end();
  await client1.end();
}

main();

function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}
