import { Infer, object, string } from "superstruct";

export type Address = Infer<typeof address>;

export const address = object({
  street: string(),
});


export type IpAddress = string & { __type: 'IpAddress'}