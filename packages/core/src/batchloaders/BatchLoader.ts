/**
 * Like DataLoader, but all callers in the same tick share a single Promise<void>.
 *
 * The batch function writes results into a side channel (e.g. setPreloadedRelation
 * or em.hydrate), so there's no per-key return value — just one shared promise
 * that signals "the batch is done".
 */
export class BatchLoader<K> {
  #batchFn: (keys: K[]) => Promise<void>;
  #pending: K[] | undefined;
  #batchPromise: Promise<void> | undefined;

  constructor(batchFn: (keys: K[]) => Promise<void>) {
    this.#batchFn = batchFn;
  }

  load(key: K): Promise<void> {
    this.#ensureBatch();
    this.#pending!.push(key);
    return this.#batchPromise!;
  }

  loadAll(keys: K[]): Promise<void> {
    this.#ensureBatch();
    this.#pending!.push(...keys);
    return this.#batchPromise!;
  }

  #ensureBatch(): void {
    if (!this.#pending) {
      this.#pending = [];
      this.#batchPromise = new Promise<void>((resolve, reject) => {
        enqueuePostPromiseJob(() => {
          const keys = this.#pending!;
          this.#pending = undefined;
          this.#batchPromise = undefined;
          this.#batchFn(keys).then(resolve, reject);
        });
      });
    }
  }
}

const resolvedPromise = Promise.resolve();

// Matches DataLoader's enqueuePostPromiseJob scheduling:
// https://github.com/graphql/dataloader/blob/main/src/index.js#L214
const enqueuePostPromiseJob =
  typeof process === "object" && typeof process.nextTick === "function"
    ? (fn: () => void) => resolvedPromise.then(() => process.nextTick(fn))
    : (fn: () => void) => setTimeout(fn);
