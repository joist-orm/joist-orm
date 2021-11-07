// export type Exact<T, U> = T &
//   {
//     [K in keyof U]: K extends keyof T
//       ? T[K] extends Array<infer TU> | undefined | null
//         ? U[K] extends Array<infer UU> | undefined | null
//           ? U extends Entity
//             ? Array<U> | undefined | null
//             : T extends Entity
//             ? Array<U> | undefined | null
//             : Array<Exact<TU, UU>> | undefined | null
//           : never
//         : U[K]
//       : never;
//   };

type Primitive = null | undefined | string | number | boolean | symbol | bigint;
type KeysOfUnion<T> = T extends T ? keyof T : never;

export type Exact<ParameterType, InputType extends ParameterType> = ParameterType extends Primitive
  ? ParameterType
  : ParameterType &
      { [Key in keyof ParameterType]: Exact<ParameterType[Key], InputType[Key]> } &
      Record<Exclude<keyof InputType, KeysOfUnion<ParameterType>>, never>;
