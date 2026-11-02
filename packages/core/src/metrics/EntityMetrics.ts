/** Request totals for a named calculation, validation rule, or reaction. */
export interface EvaluationStats {
  readonly name: string;
  readonly count: number;
  /** Inclusive elapsed time, including time awaiting an asynchronous callback. */
  readonly totalMillis: number;
}

/** A detached copy of the request's accumulated metrics. Reading it does not reset totals. */
export interface EntityMetricsSnapshot {
  readonly evaluations: readonly EvaluationStats[];
}

/** One shared counter per entity type/member; never allocated per invocation. */
interface EvaluationTotals {
  count: number;
  totalMillis: number;
}

/**
 * @internal Caches a member definition's current request counter.
 *
 * Store only a collector identity token, not the collector: boot-scoped members must not keep
 * completed requests alive. The cached counter contains only numbers.
 */
export class EvaluationSlot {
  lastCollector: symbol | undefined;
  lastTotals: EvaluationTotals | undefined;

  constructor(readonly name: string) {}
}

/**
 * Accumulates request metrics across calculations, validation rules, reactions, and flushes.
 *
 * An application should generally create one EntityMetrics instance per request, and attach it to
 * that request's EntityManager. Then, when the request is done, publish the snapshot stats to your
 * observability platform of choice.
 *
 * Note that nested evaluations have inclusive timings, so their total is not request wall time.
 * No entity instances are retained.
 */
export class EntityMetrics {
  readonly #id = Symbol();
  // Keyed by EvaluationSlot.name, e.g. Author.numberOfBooks.
  readonly #evaluations = new Map<string, EvaluationTotals>();

  /** Returns a detached snapshot without resetting this collector. */
  snapshot(): EntityMetricsSnapshot {
    const evaluations: EvaluationStats[] = [];
    for (const [name, totals] of this.#evaluations) {
      evaluations.push({ name, ...totals });
    }
    return { evaluations };
  }

  /** @internal Counts an invocation without lookups while a member's collector is unchanged. */
  start(slot: EvaluationSlot): EvaluationTotals {
    let totals = slot.lastTotals;
    if (!totals || slot.lastCollector !== this.#id) {
      totals = this.getTotals(slot);
    }
    totals.count++;
    return totals;
  }

  /** Returns this EntityMetrics instance's counter for the shared `slot` identity. */
  private getTotals(slot: EvaluationSlot): EvaluationTotals {
    let totals = this.#evaluations.get(slot.name);
    if (!totals) this.#evaluations.set(slot.name, (totals = { count: 0, totalMillis: 0 }));
    slot.lastCollector = this.#id;
    slot.lastTotals = totals;
    return totals;
  }

  /** @internal Records a synchronous throw's elapsed time. */
  finish(totals: EvaluationTotals, started: number): void;
  /** @internal Records the callback's elapsed time, awaiting settlement only for promise results. */
  finish<V>(totals: EvaluationTotals, started: number, value: V): V;
  finish<V>(totals: EvaluationTotals, started: number, value?: V): V | undefined {
    if (isPromiseLike(value)) return finishAsync(totals, started, value) as V;
    totals.totalMillis += performance.now() - started;
    return value;
  }
}

/** Keeps promise-handler closures out of the synchronous hot path's function scope. */
function finishAsync<V>(totals: EvaluationTotals, started: number, value: PromiseLike<V>): Promise<V> {
  // Observe both outcomes without an unhandled, rejected instrumentation-only promise.
  return Promise.resolve(value).then(
    (result) => {
      totals.totalMillis += performance.now() - started;
      return result;
    },
    (error: unknown) => {
      totals.totalMillis += performance.now() - started;
      throw error;
    },
  );
}

/** Recognizes asynchronous callbacks without changing synchronous return values. */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function"
  );
}
