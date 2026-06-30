import { setDefaultEntityLimit, type Loaded } from "joist-orm";
import { performance } from "node:perf_hooks";
import { Author, type EntityManager } from "./src/entities";
import { knex, newEntityManager, numberOfQueries, resetQueryCount, testDriver } from "./src/testEm";

type DeepPopulateHint = { books: { reviews: "comment"; comments: {} } };

interface ScenarioContext {
  authors: Author[];
  em: EntityManager;
}

interface ScenarioResult {
  checksum: number;
  context: ScenarioContext;
}

interface Scenario {
  name: string;
  setup(size: number): Promise<ScenarioContext>;
  run(context: ScenarioContext): Promise<ScenarioResult>;
}

interface Sample {
  cpuSystemMs: number;
  cpuUserMs: number;
  heapDeltaMb: number;
  heapRetainedMb: number;
  queries: number;
  wallMs: number;
}

interface Summary {
  cpuSystemMs: number;
  cpuUserMs: number;
  heapDeltaMb: number;
  heapRetainedMb: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  queries: number;
  rsdPct: number;
}

interface BenchmarkConfig {
  iterations: number;
  size: number;
  warmups: number;
}

let blackhole = 0;
let heldResult: ScenarioResult | undefined;
const booksPerAuthor = Number(process.env.BENCH_BOOKS_PER_AUTHOR ?? 2);
const reviewsPerBook = Number(process.env.BENCH_REVIEWS_PER_BOOK ?? 2);
const commentsPerBook = Number(process.env.BENCH_COMMENTS_PER_BOOK ?? 1);
const repeatCount = Number(process.env.BENCH_REPEAT ?? 100);
const createdAt = new Date("2020-01-01T00:00:00.000Z");
const updatedAt = new Date("2020-01-02T00:00:00.000Z");

/** Benchmarks deep populate traversal across o2m/o2m/o2o and sibling o2m paths. */
async function main(): Promise<void> {
  const sizes = readSizes();
  const maxSize = Math.max(...sizes);
  const maxBooks = maxSize * booksPerAuthor;
  const maxReviews = maxBooks * reviewsPerBook;
  const maxComments = maxBooks * commentsPerBook + maxReviews;
  setDefaultEntityLimit(maxSize + maxBooks + maxReviews + maxComments + 1_000);
  console.log(`node=${process.version} exposeGc=${typeof global.gc === "function"}`);
  console.log(
    `books_per_author=${booksPerAuthor} reviews_per_book=${reviewsPerBook} comments_per_book=${commentsPerBook}`,
  );
  console.log(`repeat=${repeatCount}`);
  console.log(
    "scenario,size,samples,p50_ms,p90_ms,p99_ms,mean_ms,rsd_pct,cpu_user_ms,cpu_system_ms,heap_delta_mb,heap_retained_mb,queries",
  );

  for (const size of sizes) {
    await seed(size);
    const config = configForSize(size);
    await runScenario(populateDeep(), config);
    await runScenario(populateDeepAlreadyLoaded(), config);
    await runScenario(populateDeepAlreadyLoadedRepeat(), config);
  }

  if (blackhole === Number.MIN_SAFE_INTEGER) console.log(blackhole);
  await testDriver.destroy();
}

/** Returns the sizes to benchmark, allowing BENCH_SIZES=1000,10000 overrides. */
function readSizes(): number[] {
  const input = process.env.BENCH_SIZES;
  if (!input) return [1_000, 10_000];
  return input.split(",").map(function parseSize(value) {
    return Number(value.trim());
  });
}

/** Returns iteration counts that keep DB-backed deep populate runs practical. */
function configForSize(size: number): BenchmarkConfig {
  const iterations = Number(process.env.BENCH_ITERATIONS);
  const warmups = Number(process.env.BENCH_WARMUPS);
  if (iterations > 0 && warmups >= 0) return { iterations, size, warmups };
  if (size >= 10_000) return { iterations: 5, size, warmups: 2 };
  return { iterations: 10, size, warmups: 3 };
}

/** Measures one scenario after warmup and prints a CSV row. */
async function runScenario(scenario: Scenario, config: BenchmarkConfig): Promise<void> {
  for (let i = 0; i < config.warmups; i++) {
    consume(await scenario.run(await scenario.setup(config.size)));
    forceGc();
  }

  const samples: Sample[] = [];
  for (let i = 0; i < config.iterations; i++) {
    const context = await scenario.setup(config.size);
    forceGc();
    resetQueryCount();
    const heapBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const start = performance.now();
    heldResult = await scenario.run(context);
    const wallMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuBefore);
    const heapAfterRun = process.memoryUsage().heapUsed;
    forceGc();
    const heapAfterGc = process.memoryUsage().heapUsed;
    consume(heldResult);
    heldResult = undefined;
    samples.push({
      cpuSystemMs: cpu.system / 1_000,
      cpuUserMs: cpu.user / 1_000,
      heapDeltaMb: (heapAfterRun - heapBefore) / 1024 / 1024,
      heapRetainedMb: (heapAfterGc - heapBefore) / 1024 / 1024,
      queries: numberOfQueries,
      wallMs,
    });
    forceGc();
    await new Promise<void>(resolveImmediate);
  }

  const summary = summarize(samples);
  console.log(
    [
      scenario.name,
      config.size,
      config.iterations,
      fmt(summary.p50Ms),
      fmt(summary.p90Ms),
      fmt(summary.p99Ms),
      fmt(summary.meanMs),
      fmt(summary.rsdPct),
      fmt(summary.cpuUserMs),
      fmt(summary.cpuSystemMs),
      fmt(summary.heapDeltaMb),
      fmt(summary.heapRetainedMb),
      fmt(summary.queries),
    ].join(","),
  );
}

/** Populates a deep graph breadth-first across many root entities. */
function populateDeep(): Scenario {
  return {
    name: "populate_deep_books_reviews_comments",
    setup: setupContext,
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const authors = await context.em.populate(context.authors, { books: { reviews: "comment", comments: {} } });
      return { checksum: countDeep(authors), context };
    },
  };
}

/** Re-populates an already-loaded deep graph to measure traversal skip overhead. */
function populateDeepAlreadyLoaded(): Scenario {
  return {
    name: "populate_deep_books_reviews_comments_already_loaded",
    async setup(size: number): Promise<ScenarioContext> {
      const context = await setupContext(size);
      await context.em.populate(context.authors, { books: { reviews: "comment", comments: {} } });
      return context;
    },
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      const authors = await context.em.populate(context.authors, { books: { reviews: "comment", comments: {} } });
      return { checksum: countDeep(authors), context };
    },
  };
}

/** Re-populates an already-loaded deep graph repeatedly to isolate skip/traversal overhead. */
function populateDeepAlreadyLoadedRepeat(): Scenario {
  return {
    name: "populate_deep_books_reviews_comments_already_loaded_repeat",
    async setup(size: number): Promise<ScenarioContext> {
      const context = await setupContext(size);
      await context.em.populate(context.authors, { books: { reviews: "comment", comments: {} } });
      return context;
    },
    async run(context: ScenarioContext): Promise<ScenarioResult> {
      let authors: Loaded<Author, DeepPopulateHint>[] = [];
      for (let i = 0; i < repeatCount; i++) {
        authors = await context.em.populate(context.authors, { books: { reviews: "comment", comments: {} } });
      }
      return { checksum: countDeep(authors), context };
    },
  };
}

/** Loads benchmark root authors into a fresh EntityManager. */
async function setupContext(size: number): Promise<ScenarioContext> {
  const em = newEntityManager();
  const authors = await em.find(Author, {}, { orderBy: { id: "ASC" }, limit: size });
  return { authors, em };
}

/** Seeds authors, books, reviews, and comments once for all samples of a size. */
async function seed(size: number): Promise<void> {
  await testDriver.beforeEach();
  await batchInsert(
    "authors",
    range(size, function makeAuthor(i) {
      return {
        id: i + 1,
        first_name: `author${i}`,
        initials: "a",
        number_of_books: 0,
        tags_of_all_books: "",
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }),
  );
  const bookCount = size * booksPerAuthor;
  await batchInsert(
    "books",
    range(bookCount, function makeBook(i) {
      return {
        id: i + 1,
        title: `book${i}`,
        author_id: Math.floor(i / booksPerAuthor) + 1,
        notes: "notes",
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }),
  );
  const reviewCount = bookCount * reviewsPerBook;
  await batchInsert(
    "book_reviews",
    range(reviewCount, function makeReview(i) {
      return {
        id: i + 1,
        book_id: Math.floor(i / reviewsPerBook) + 1,
        rating: i % 5,
        is_public: true,
        is_test: false,
        is_test_chain: false,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }),
  );
  await seedComments(bookCount, reviewCount);
}

/** Seeds one comment per review and configurable comments per book. */
async function seedComments(bookCount: number, reviewCount: number): Promise<void> {
  const commentCount = reviewCount + bookCount * commentsPerBook;
  await batchInsert(
    "comments",
    range(commentCount, function makeComment(i) {
      if (i < reviewCount) {
        return {
          id: i + 1,
          text: `review-comment${i}`,
          parent_book_review_id: i + 1,
          parent_tags: "",
        };
      }
      const bookCommentIndex = i - reviewCount;
      return {
        id: i + 1,
        text: `book-comment${bookCommentIndex}`,
        parent_book_id: Math.floor(bookCommentIndex / commentsPerBook) + 1,
        parent_tags: "",
      };
    }),
  );
}

/** Inserts rows in chunks to avoid oversized SQL statements. */
async function batchInsert(tableName: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  await knex.batchInsert(tableName, rows, 1_000);
  await knex.raw(`SELECT setval('${tableName}_id_seq', ${rows.length}, true)`);
}

/** Creates an array of values by calling `fn` for each index. */
function range<T>(size: number, fn: (i: number) => T): T[] {
  const rows = new Array<T>(size);
  for (let i = 0; i < size; i++) {
    rows[i] = fn(i);
  }
  return rows;
}

/** Counts loaded deep graph nodes while keeping relation values observable. */
function countDeep(authors: readonly Loaded<Author, DeepPopulateHint>[]): number {
  let count = 0;
  for (const author of authors) {
    for (const book of author.books.get) {
      count += book.comments.get.length;
      for (const review of book.reviews.get) {
        if (review.comment.get) count++;
      }
    }
  }
  return count;
}

/** Summarizes benchmark samples. */
function summarize(samples: Sample[]): Summary {
  const wall = samples
    .map(function readWall(sample) {
      return sample.wallMs;
    })
    .sort(function compareNumbers(a, b) {
      return a - b;
    });
  const meanMs = mean(wall);
  return {
    cpuSystemMs: mean(
      samples.map(function readCpuSystem(sample) {
        return sample.cpuSystemMs;
      }),
    ),
    cpuUserMs: mean(
      samples.map(function readCpuUser(sample) {
        return sample.cpuUserMs;
      }),
    ),
    heapDeltaMb: mean(
      samples.map(function readHeapDelta(sample) {
        return sample.heapDeltaMb;
      }),
    ),
    heapRetainedMb: mean(
      samples.map(function readHeapRetained(sample) {
        return sample.heapRetainedMb;
      }),
    ),
    meanMs,
    p50Ms: percentile(wall, 0.5),
    p90Ms: percentile(wall, 0.9),
    p99Ms: percentile(wall, 0.99),
    queries: mean(
      samples.map(function readQueries(sample) {
        return sample.queries;
      }),
    ),
    rsdPct: (standardDeviation(wall, meanMs) / meanMs) * 100,
  };
}

/** Returns the arithmetic mean. */
function mean(values: readonly number[]): number {
  return (
    values.reduce(function add(sum, value) {
      return sum + value;
    }, 0) / values.length
  );
}

/** Returns the nearest-rank percentile. */
function percentile(sortedValues: readonly number[], p: number): number {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * p) - 1));
  return sortedValues[index];
}

/** Returns the population standard deviation. */
function standardDeviation(values: readonly number[], meanValue: number): number {
  const variance = mean(
    values.map(function squareDifference(value) {
      return (value - meanValue) ** 2;
    }),
  );
  return Math.sqrt(variance);
}

/** Keeps benchmark results observable until after retained heap is measured. */
function consume(result: ScenarioResult): void {
  blackhole += result.checksum + result.context.em.numberOfEntities + result.context.authors.length;
}

/** Runs a full GC when node was started with --expose-gc. */
function forceGc(): void {
  global.gc?.();
}

/** Resolves on the next immediate tick. */
function resolveImmediate(resolve: () => void): void {
  setImmediate(resolve);
}

/** Formats numeric CSV fields. */
function fmt(value: number): string {
  return value.toFixed(3);
}

main().catch(async function handleError(error: unknown): Promise<void> {
  console.error(error);
  await testDriver.destroy();
  process.exitCode = 1;
});
