import { Entity, RelationsIn } from "joist-orm";

/** The keys in `T` that rules & hooks can auth against. */
export type Authable<T extends Entity> = RelationsIn<T>;

export type AuthHint<T extends Entity> =
  | (keyof Authable<T> & string)
  | ReadonlyArray<keyof Authable<T> & string>
  | NestedAuthHint<T>;

export type NestedAuthHint<T extends Entity> = {
  [K in keyof Authable<T>]?: Authable<T>[K] extends infer U extends Entity ? AuthHint<U> : {};
};
