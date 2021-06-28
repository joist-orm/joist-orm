import { Deferred } from "@src/Deferred";

/** A utility class for enforcing deterministic order in asynchronous tests. */
export class Stepper {
  private step = 1;
  private pendingSteps: Record<number, Deferred<void>> = {};

  public on<T>(step: number, then: () => PromiseLike<T>): PromiseLike<T> {
    let result: Promise<T>;

    if (step < this.step) {
      throw new Error(`We're already on step ${this.step}`);
    } else if (this.pendingSteps[step]) {
      throw new Error(`There is already a step registered for ${this.step}`);
    } else if (step === this.step) {
      // Let this step go ahead
      result = Promise.resolve().then(() => then());
    } else {
      // Otherwise store a deferred that we'll invoke later
      const deferred = new Deferred<void>();
      this.pendingSteps[step] = deferred;
      result = deferred.promise.then(() => then());
    }

    // Start the next step after this one is done
    result
      .finally(() => {
        this.step = step + 1;
        const nextStep = this.pendingSteps[this.step];
        if (nextStep) {
          // ...maybe do this as a setTimeout? It seems to be working fine as-is.
          nextStep.resolve();
        }
      })
      .catch(() => {
        // The new `.finally` is technically a new promise that we want to keep
        // from hitting the uncaught error handler. The caller should be `.catch`ing
        // the `result` that we return to them, so we can ignore it here.
      });

    return result;
  }
}

describe("Stepper", () => {
  it("goes in order", async () => {
    const seen: number[] = [];
    const steps = new Stepper();

    const t1 = (async () => {
      await steps.on(1, async () => seen.push(1));
      await steps.on(3, async () => seen.push(3));
    })();

    const t2 = (async () => {
      await steps.on(2, async () => seen.push(2));
      await steps.on(4, async () => seen.push(4));
    })();

    await Promise.all([t1, t2]);
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("goes in order with nested awaits", async () => {
    const seen: number[] = [];
    const steps = new Stepper();

    const t1 = (async () => {
      await steps.on(1, async () => seen.push(1));
      await steps.on(3, async () => {
        seen.push(30);
        await Promise.resolve();
        seen.push(31);
        await Promise.resolve();
        seen.push(32);
      });
    })();

    const t2 = (async () => {
      await steps.on(2, async () => seen.push(2));
      await steps.on(4, async () => seen.push(4));
    })();

    await Promise.all([t1, t2]);
    expect(seen).toEqual([1, 2, 30, 31, 32, 4]);
  });
});
