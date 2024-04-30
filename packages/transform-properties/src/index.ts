import { transformer } from "./properties-transformer";

export default transformer;

export const version = 1;

export const name = "joist-transform-properties";

export function factory() {
  return transformer;
}
