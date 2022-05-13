type ToKeys<S extends string> = S extends `${infer H} ${infer T}` ? H | `${ToKeys<T>}` : S;

function k<S extends string>(strings: S): ToKeys<S>[] {
  return strings.split(" ") as ToKeys<S>[];
}

function foo(k: "foo" | "bar") {}

const keys = k(`foo bar zaz`);
// keys.forEach(foo);
