import pg from "pg";

/**
 * Probes what the pg socket actually hands pg-protocol during a large streaming result:
 *
 * 1. Are 'data' Buffers exact-sized, standalone GC allocations (retainable without pinning
 *    a larger backing store)?
 * 2. How often does a chunk start exactly on a protocol-frame boundary with no pending
 *    partial frame (the only case pg-protocol adopts the chunk zero-copy vs copying into
 *    its recycled scratch buffer)?
 */
async function main(): Promise<void> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL ?? "postgres://joist:local@localhost:5435/joist",
  });
  await client.connect();
  const stream = (client as any).connection.stream;

  let chunks = 0;
  let totalBytes = 0;
  let exactBacking = 0;
  let adoptable = 0;
  const sizes: number[] = [];
  // Frame-scan with carry: `pendingBody` = bytes of the current frame still to come;
  // `partialHeader` = header bytes seen so far when a 5-byte header itself straddles chunks
  let pendingBody = 0;
  let partialHeader: Buffer | undefined = undefined;

  stream.on("data", (b: Buffer) => {
    chunks++;
    totalBytes += b.length;
    sizes.push(b.length);
    if (b.byteOffset === 0 && b.buffer.byteLength === b.length) exactBacking++;
    if (pendingBody === 0 && partialHeader === undefined) adoptable++;

    let off = 0;
    if (pendingBody > 0) {
      const take = Math.min(pendingBody, b.length);
      off += take;
      pendingBody -= take;
      if (pendingBody > 0) return;
    }
    if (partialHeader !== undefined) {
      const need = 5 - partialHeader.length;
      const take = Math.min(need, b.length - off);
      partialHeader = Buffer.concat([partialHeader, b.subarray(off, off + take)]);
      off += take;
      if (partialHeader.length < 5) return;
      const frameLen = partialHeader.readUInt32BE(1) + 1;
      pendingBody = frameLen - partialHeader.length;
      partialHeader = undefined;
      const take2 = Math.min(pendingBody, b.length - off);
      off += take2;
      pendingBody -= take2;
      if (pendingBody > 0) return;
    }
    while (off < b.length) {
      if (off + 5 > b.length) {
        partialHeader = Buffer.from(b.subarray(off));
        return;
      }
      const frameLen = b.readUInt32BE(off + 1) + 1;
      if (off + frameLen <= b.length) {
        off += frameLen;
      } else {
        pendingBody = off + frameLen - b.length;
        return;
      }
    }
  });

  // ~57MB of DataRows: 200k rows x ~290 bytes
  await client.query("select i, repeat('x', 280) as pad from generate_series(1, 200000) i");
  await client.end();

  sizes.sort((a, b) => a - b);
  console.log(`node=${process.version}`);
  console.log(`chunks=${chunks} totalMB=${(totalBytes / 1024 / 1024).toFixed(1)}`);
  console.log(`exactBacking=${exactBacking}/${chunks} (data buffers whose backing store is exactly their length)`);
  console.log(`adoptable=${adoptable}/${chunks} (chunks starting clean on a frame boundary => pg-protocol adopts zero-copy)`);
  console.log(
    `chunk size p0/p50/p90/p100 = ${sizes[0]}/${sizes[Math.floor(sizes.length / 2)]}/${sizes[Math.floor(sizes.length * 0.9)]}/${sizes[sizes.length - 1]}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
