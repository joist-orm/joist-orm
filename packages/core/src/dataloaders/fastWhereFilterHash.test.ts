import { fastWhereFilterHash } from "./fastWhereFilterHash";

describe("fastWhereFilterHash", () => {
  it("returns stable hashes for object keys regardless of insertion order", () => {
    const first = fastWhereFilterHash({ b: 2, a: "one" });
    const second = fastWhereFilterHash({ a: "one", b: 2 });

    expect(first).toEqual("o2{1:a=s3:one;1:b=d2;}");
    expect(second).toEqual(first);
  });

  it("uses type tags to distinguish similar scalar values", () => {
    expect([
      fastWhereFilterHash({ value: "1" }),
      fastWhereFilterHash({ value: 1 }),
      fastWhereFilterHash({ value: true }),
      fastWhereFilterHash({ value: 1n }),
      fastWhereFilterHash({ value: null }),
      fastWhereFilterHash({ value: undefined }),
    ]).toEqual([
      "o1{5:value=s1:1;}",
      "o1{5:value=d1;}",
      "o1{5:value=b1;}",
      "o1{5:value=i1;}",
      "o1{5:value=n;}",
      "o1{5:value=u;}",
    ]);
  });

  it("hashes nested arrays and plain objects", () => {
    const hash = fastWhereFilterHash({ ids: [1, 2], nested: { name: "a1" } });

    expect(hash).toEqual("o2{3:ids=a2[d1;d2;]6:nested=o1{4:name=s2:a1;}}");
  });

  it("hashes date values with their db representation", () => {
    expect(fastWhereFilterHash({ at: new Date("2020-01-02T03:04:05.000Z") })).toEqual(
      "o1{2:at=t24:2020-01-02T03:04:05.000Z;}",
    );
  });

  it("hashes byte array values by their contents", () => {
    expect(fastWhereFilterHash({ value: new Uint8Array([11, 22]) })).toEqual("o1{5:value=y10:Uint8Array:4:CxY=;}");
  });

  it("hashes custom value objects by constructor and enumerable values", () => {
    expect(fastWhereFilterHash({ value: new SupportedValue("a1") })).toEqual(
      "o1{5:value=c14:SupportedValue:1{4:name=s2:a1;}}",
    );
  });

  it("returns undefined for unsupported object types", () => {
    expect([
      fastWhereFilterHash(new Map([["name", "a1"]])),
      fastWhereFilterHash(function unsupportedFunction() {}),
    ]).toEqual([undefined, undefined]);
  });

  it("returns undefined for circular structures", () => {
    const value: { name: string; self?: unknown } = { name: "a1" };
    value.self = value;

    expect(fastWhereFilterHash(value)).toEqual(undefined);
  });
});

class SupportedValue {
  constructor(readonly name: string) {}
}
