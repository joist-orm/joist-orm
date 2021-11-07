import { DeepPartialOrNull } from "src/createOrUpdatePartial";
import { Entity } from "src/EntityManager";
import { Exact } from "./Exact";

describe("Exact", () => {
  it("accepts good simple", () => {
    type T1 = { a?: number };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1 };
    f(p);
  });

  it("rejects invalid key", () => {
    type T1 = { a?: number; b?: string };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1, c: 1 };
    // @ts-expect-error
    f(p);
  });

  it("accepts good nested list", () => {
    type T1 = { a?: number; b?: Array<{ c?: number; d?: number }> };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1, b: [{ c: 1 }] };
    f(p);
  });

  it("rejects invalid nested list", () => {
    type T1 = { a?: number; b?: Array<{ c?: number; d?: number }> };
    function f<O extends Exact<T1, O>>(p: O) {}
    // @ts-expect-error
    f({ a: 1, b: [{ c: 1, e: 1 }] });
  });

  it("accepts good simple with null", () => {
    type T1 = { a?: number | null; b?: number | null };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1 };
    f(p);
  });

  it("reject invalid key with null", () => {
    type T1 = { a?: number | null; b?: number | null };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1, c: 1 };
    // @ts-expect-error
    f(p);
  });

  it("rejects invalid nested list with null", () => {
    type T1 = {
      a?: number | null;
      b?: Array<{ c?: number | null; d?: number | null }> | null;
    };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1, b: [{ c: 1, e: 1 }] };
    // @ts-expect-error
    f(p);
  });

  it("accepts valid null list", () => {
    type T1 = {
      a?: number | null;
      b?: Array<{ c?: number | null; d?: number | null }> | null;
    };
    function f<O extends Exact<T1, O>>(p: O) {}
    const p = { a: 1, b: null };
    f(p);
  });

  it("accepts generic", () => {
    type T1 = { a?: number };
    function f<O extends Exact<TwoKeys<number, number>, O>>(p: O) {}
    const p = { a: 1 };
    f(p);
  });

  it("rejects invalid generic", () => {
    type T1 = { a?: number };
    function f<O extends Exact<TwoKeys<number, number>, O>>(p: O) {
      const p2: TwoKeys<number, number> = p;
      console.log(p2);
    }
    const p = { a: 1, c: 1 };
    type P = Exact<T1, typeof p>;
    // @ts-expect-error
    f(p);
  });

  it("accepts good simple", () => {
    type T1 = { a: number };
    function f<O extends PartialOrNull<T1>>(p: Exact<PartialOrNull<T1>, O>) {
      const a: number | null | undefined = p.a;
      console.log(a);
    }
    const p = { a: null };
    f(p);
  });

  it("rejects deep partial", () => {
    type T1 = Entity;
    function f<O extends Exact<DeepPartialOrNull<T1>, O>>(p: O) {}
    const p = { b: null };
    // @ts-expect-error
    f(p);
  });

  it("works with get opts", () => {
    type T1 = { opts: { a: number } };
    type GetOpts<T> = T extends { opts: infer O } ? O : never;
    function f<T, O extends Exact<GetOpts<T>, O>>(t: T, p: O) {}
    const t: T1 = { opts: { a: 1 } };
    const o = { a: 1, b: null };
    // @ts-expect-error
    f(t, o);
  });

  it("o keeps its type", () => {
    type T1 = { opts: { a: number } };
    type New<T, O extends GetOpts<T>> = T;
    type GetOpts<T> = T extends { opts: infer O } ? O : never;
    function f<T, O extends Exact<GetOpts<T>, O>>(t: T, p: O): New<T, O> {
      return null!;
    }
    const t: T1 = { opts: { a: 1 } };
    const o = { a: 1, b: null };
    // @ts-expect-error
    f(t, o);
  });

  it("works with DeepPartial", () => {
    type DeepPartial<T> = {
      [P in keyof T]?: T[P] extends Array<infer U>
        ? Array<DeepPartial<U>>
        : T[P] extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepPartial<U>>
        : T[P] extends object
        ? DeepPartial<T[P]>
        : T[P];
    };
    type T1 = { a: number; b: { c: number; d: number } };
    function f<T, O extends Exact<DeepPartial<T>, O>>(t: T, p: O): void {}
    const t: T1 = { a: 1, b: { c: 2, d: 3 } };
    // c is allowed to be dropped, but e is not allowed
    const o = { a: 1, b: { d: 4, e: 5 } };
    // @ts-expect-error
    f(t, o);
  });
});

type TwoKeys<A, B> = { a?: A; b?: B };

type PartialOrNull<T> = {
  [P in keyof T]?: T[P] | null;
};
