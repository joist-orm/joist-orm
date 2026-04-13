import sinon from "sinon";
import { setClock } from "src/test/testClock";
import { jan1PT, jan1UTC, jan2PT } from "src/test/testDates";
import { zeroTo } from "src/utils";
import { clearCaches, DataCache, getEntries, newEntry } from "src/utils/dataCache";
import * as jb from "src/utils/jsonbinding";

const binding = jb.object({ value: jb.number() });
type TestData = jb.Infer<typeof binding>;
const dataFn = (value: number) => Promise.resolve({ value });
const opts = { name: "test", binding, version: "1" };

describe("DataCache", () => {
  beforeEach(() => clearCaches());
  beforeEach(() => DataCache.enable());
  afterEach(() => DataCache.disable());

  it.withCtx("should cache and return values in memory", async (ctx) => {
    const stubDataFn = sinon.stub<[number], Promise<TestData>>().callsFake(dataFn);
    const getSpy = sinon.spy(ctx.elastiCache!, "get");
    const cache = DataCache.create({ ...opts, version: "2" }, stubDataFn);
    // run the first 2 calls in parallel to ensure we don't run the callback more than once
    const [result1, result2] = await Promise.all([cache.get(ctx, 1), cache.get(ctx, 1)]);
    const result3 = await cache.get(ctx, 1);
    expect(result1).toEqual({ value: 1 });
    expect(result2).toEqual({ value: 1 });
    expect(result3).toEqual({ value: 1 });
    sinon.assert.calledOnce(stubDataFn);
    sinon.assert.calledOnceWithExactly(getSpy, "test:2:1:pushedAt");
  });

  describe("cleanup", () => {
    it.withCtx("should cleanup the least recently used entries when over maxEntries", async (ctx) => {
      const cache = DataCache.create({ ...opts, maxEntries: 3 }, dataFn);
      zeroTo(5, (i) => newEntry(cache, { accessedAt: jan1UTC.add({ hours: i }) }));
      DataCache.cleanup(ctx);
      expect(getEntries(cache)).toMatchObject([
        { key: "key:3", accessedAt: jan1UTC.add({ hours: 2 }) },
        { key: "key:4", accessedAt: jan1UTC.add({ hours: 3 }) },
        { key: "key:5", accessedAt: jan1UTC.add({ hours: 4 }) },
      ]);
    });

    it.withCtx("should not cleanup entries that aren't pushed yet", async (ctx) => {
      const cache = DataCache.create({ ...opts, maxEntries: 0 }, dataFn);
      newEntry(cache, { pushedAt: undefined });
      DataCache.cleanup(ctx);
      expect(getEntries(cache)).toMatchObject([{ key: "key:1", pushedAt: undefined }]);
    });

    it.withCtx("should not cleanup entries that have an active promise", async (ctx) => {
      const cache = DataCache.create({ ...opts, maxEntries: 0 }, dataFn);
      const promise = Promise.resolve();
      newEntry(cache, { promise });
      DataCache.cleanup(ctx);
      expect(getEntries(cache)).toMatchObject([{ key: "key:1", promise }]);
    });

    it.withCtx("should not cleanup entries that don't have an accessedAt", async (ctx) => {
      const cache = DataCache.create({ ...opts, maxEntries: 0 }, dataFn);
      newEntry(cache, { accessedAt: undefined, pushedAt: jan1UTC });
      DataCache.cleanup(ctx);
      expect(getEntries(cache)).toMatchObject([{ key: "key:1", accessedAt: undefined }]);
    });
  });

  it.withCtx("should bypass the cache when disabled", async (ctx) => {
    const stubDataFn = sinon.stub<[number], Promise<TestData>>().callsFake(dataFn);
    const getSpy = sinon.spy(ctx.elastiCache!, "get");
    const cache = DataCache.create(opts, stubDataFn);
    DataCache.disable();
    await Promise.all([cache.get(ctx, 1), cache.get(ctx, 1)]);
    await cache.get(ctx, 1);
    sinon.assert.calledThrice(stubDataFn);
    sinon.assert.notCalled(getSpy);
  });

  it.withCtx("should serialize new entries to ElastiCache", async (ctx) => {
    const cache = DataCache.create({ ...opts }, dataFn);
    const msetSpy = sinon.spy(ctx.elastiCache!, "mset");
    // create multiple unsynced entries to ensure we are only calling the external cache once
    newEntry(cache, { pushedAt: undefined, data: { value: 1 } });
    newEntry(cache, { pushedAt: jan1PT, data: { value: 1 } });
    newEntry(cache, { pushedAt: undefined, data: { value: 3 } });
    setClock(jan2PT);
    // run push in parallel to ensure we aren't calling set more than once later
    await Promise.all([DataCache.push(ctx), DataCache.push(ctx)]);
    sinon.assert.calledOnce(msetSpy);
    sinon.assert.calledWith(msetSpy, {
      "test:1:key:1": '{"value":1}',
      "test:1:key:1:pushedAt": "2018-01-02T08:00:00+00:00[UTC]",
      "test:1:key:3": '{"value":3}',
      "test:1:key:3:pushedAt": "2018-01-02T08:00:00+00:00[UTC]",
    });
    expect(getEntries(cache)).toMatchObject([
      { key: "key:1", pushedAt: jan2PT },
      { key: "key:2", pushedAt: jan1PT },
      { key: "key:3", pushedAt: jan2PT },
    ]);
  });

  it.withCtx("should deserialize new entries from ElastiCache", async (ctx) => {
    const cache = DataCache.create({ ...opts }, dataFn);
    await ctx.elastiCache!.set("test:1:1", '{"value":1}');
    await ctx.elastiCache!.set("test:1:1:pushedAt", jan1PT.toString());
    const getSpy = sinon.spy(ctx.elastiCache!, "get");
    const result = await cache.get(ctx, 1);
    sinon.assert.calledTwice(getSpy);
    sinon.assert.calledWith(getSpy.firstCall, "test:1:1:pushedAt");
    sinon.assert.calledWith(getSpy.secondCall, "test:1:1");
    expect(result).toEqual({ value: 1 });
  });

  it.withCtx("should delete an entry", async (ctx) => {
    const cache = DataCache.create({ ...opts, maxEntries: 5 }, dataFn);
    const deleteSpy = sinon.spy(ctx.elastiCache!, "delete");
    zeroTo(3, (i) => newEntry(cache, { key: `${i + 1}` }));
    await cache.delete(ctx, 2);
    expect(getEntries(cache)).toMatchObject([{ key: "1" }, { key: "3" }]);
    sinon.assert.calledOnceWithExactly(deleteSpy, ["test:1:2", "test:1:2:pushedAt"]);
  });

  it.withCtx("should clear all entries", async (ctx) => {
    const cache = DataCache.create({ ...opts, maxEntries: 5 }, dataFn);
    const deleteSpy = sinon.spy(ctx.elastiCache!, "delete");
    zeroTo(3, (i) => newEntry(cache, { key: `${i + 1}` }));
    await cache.clear(ctx);
    expect(getEntries(cache)).toBeEmpty();
    sinon.assert.calledOnceWithExactly(deleteSpy, [
      "test:1:1",
      "test:1:1:pushedAt",
      "test:1:2",
      "test:1:2:pushedAt",
      "test:1:3",
      "test:1:3:pushedAt",
    ]);
  });
});
