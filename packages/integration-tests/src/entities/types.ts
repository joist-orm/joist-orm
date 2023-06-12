import { Infer, object, string } from "superstruct";
import { z } from 'zod';

export type Address = Infer<typeof address>;

export const address = object({
  street: string(),
});

export const AddressSchema = z.object({
  street: z.string(),
})

export type IpAddress = string & { __type: "IpAddress" };
