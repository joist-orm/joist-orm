import {array, Infer, object, string} from "superstruct";

export type Address = Infer<typeof address>;
export type Quotes = Infer<typeof quotes>;

export const address = object({
  street: string(),
});

export const quotes = array(string());

export type IpAddress = string & { __type: "IpAddress" };
