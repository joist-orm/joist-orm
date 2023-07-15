import { AsyncLocalStorage } from "async_hooks";

/**
 * A marker to prevent setter calls during `flush` calls.
 *
 * The `flush` process does a dirty check + SQL flush and generally doesn't want
 * entities to re-dirtied after it's done the initial dirty check. So we'd like
 * to prevent all setter calls while `flush` is running.
 *
 * That said, lifecycle code like hooks actually can make setter calls b/c `flush`
 * invokes them at a specific point in its process.
 *
 * We solve this by using node's `AsyncLocalStorage` to mark certain callbacks (promise
 * handlers) as blessed / invoked-from-`flush`-itself, and they are allowed to call setters,
 * but any external callers (i.e. application code) will be rejected.
 */
const currentFlushSecret = new AsyncLocalStorage<{ flushSecret: number }>();

type AllowWrites = (fn: () => Promise<void>) => Promise<void>;

export class FlushLocker {
  #flushSecret: number = 0;
  #isFlushing: boolean = false;

  startFlush(): void {
    if (this.#isFlushing) {
      throw new Error("Cannot flush while another flush is already in progress");
    }
    this.#isFlushing = true;
  }

  stopFlush(): void {
    this.#isFlushing = false;
  }

  /** Any writes that happen from `fn`, despite flush being locked, will be allowed. */
  async allowWrites(fn: () => Promise<void>): Promise<void> {
    return currentFlushSecret.run({ flushSecret: this.#flushSecret }, () =>
      fn().then(() => {
        this.#flushSecret += 1;
      }),
    );
  }

  /** Returns false if writes are locked and the caller is not within a `allowWrites` block. */
  checkWritesAllowed(): void {
    if (this.#isFlushing) {
      const { flushSecret } = currentFlushSecret.getStore() || {};
      if (flushSecret === undefined) {
        throw new Error(`Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit`);
      } else if (flushSecret !== this.#flushSecret) {
        throw new Error(`Attempting to reuse a hook context outside its flush loop`);
      }
    }
  }
}
