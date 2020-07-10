import { Exact } from "./EntityManager";

describe("Exact", () => {
  it("accepts good simple", () => {
    type T1 = { a?: number };
    function f<O>(p: Exact<T1, O>) {}
    const p = { a: 1 };
    f(p);
  });

  it("rejects invalid key", () => {
    type T1 = { a?: number; b?: string };
    function f<O>(p: Exact<T1, O>) {}
    type P1 = Exact<T1, typeof p>;
    const p = { a: 1, c: 1 };
    // @ts-expect-error
    f(p);
  });

  it("accepts good nested list", () => {
    type T1 = { a?: number; b?: Array<{ c?: number; d?: number }> };
    function f<O>(p: Exact<T1, O>) {}
    const p = { a: 1, b: [{ c: 1 }] };
    f(p);
  });

  it("rejects invalid nested list", () => {
    type T1 = { a?: number; b?: Array<{ c?: number; d?: number }> };
    function f<O>(p: Exact<T1, O>) {}
    // @ts-expect-error
    f({ a: 1, b: [{ c: 1, e: 1 }] });
  });

  it("accepts good simple with null", () => {
    type T1 = { a?: number | null; b?: number | null };
    function f<O>(p: Exact<T1, O>) {}
    const p = { a: 1 };
    f(p);
  });

  it("reject invalid key with null", () => {
    type T1 = { a?: number | null; b?: number | null };
    function f<O>(p: Exact<T1, O>) {}
    const p = { a: 1, c: 1 };
    // @ts-expect-error
    f(p);
  });

  it("rejects invalid nested list with null", () => {
    type T1 = {
      a?: number | null;
      b?: Array<{ c?: number | null; d?: number | null }> | null;
    };
    function f<O>(p: Exact<T1, O>) {}
    const p = { a: 1, b: [{ c: 1, e: 1 }] };
    // @ts-expect-error
    f(p);
  });

  it("accepts valid null list", () => {
    type T1 = {
      a?: number | null;
      b?: Array<{ c?: number | null; d?: number | null }> | null;
    };
    function f<O>(p: Exact<T1, O>) {}
    const p = { a: 1, b: null };
    f(p);
  });

  it("accepts generic", () => {
    type T1 = { a?: number };
    function f<O extends TwoKeys<number, number>>(p: Exact<TwoKeys<number, number>, O>) {}
    const p = { a: 1 };
    f(p);
  });

  it("rejects invalid generic", () => {
    type T1 = { a?: number };
    function f<O extends TwoKeys<number, number>>(p: Exact<TwoKeys<number, number>, O>) {
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
});

type TwoKeys<A, B> = { a?: A; b?: B };

type PartialOrNull<T> = {
  [P in keyof T]?: T[P] | null;
};
