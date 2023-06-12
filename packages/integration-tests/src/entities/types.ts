import { Infer, object, string, array } from "superstruct";
import { z } from 'zod';

export type Address = Infer<typeof address>;
export type Quotes = Infer<typeof quotes>;

export const address = object({
  street: string(),
});

export const AddressSchema = z.object({
  street: z.string(),
})

export const quotes = array(string());

export type IpAddress = string & { __type: "IpAddress" };
