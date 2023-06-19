import { CustomSerde } from "joist-orm";
import { Infer, array, object, string } from "superstruct";
import { z } from "zod";

export type Address = Infer<typeof address>;
export type Quotes = Infer<typeof quotes>;

export const address = object({
  street: string(),
});

export const AddressSchema = z.object({
  street: z.string(),
});

export const quotes = array(string());

export type IpAddress = string & { __type: "IpAddress" };

export class PasswordValue {
  static fromEncoded(str: string) {
    return new PasswordValue(str);
  }

  static fromPlainText(str: string) {
    return new PasswordValue(Buffer.from(str, "utf8").toString("base64"));
  }

  constructor(public readonly encoded: string) {}

  matches(str: string) {
    return Buffer.from(str, "utf8").toString("base64") === this.encoded;
  }
}

export const PasswordValueSerde: CustomSerde<PasswordValue, string> = {
  toDb(value) {
    return value.encoded;
  },

  fromDb(value) {
    return PasswordValue.fromEncoded(value);
  },
};
