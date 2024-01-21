import {
  MakeRunInputMutation,
  MakeRunObjectField,
  MakeRunObjectFields,
  makeMakeRunInputMutation,
  makeMakeRunObjectField,
  makeMakeRunObjectFields,
} from "joist-graphql-resolver-utils/tests";
import { Context, newContext } from "joist-test-utils";

export { run } from "joist-test-utils";

export const makeRunInputMutation: MakeRunInputMutation<Context> = makeMakeRunInputMutation(newContext);
export const makeRunObjectField: MakeRunObjectField<Context> = makeMakeRunObjectField(newContext);
export const makeRunObjectFields: MakeRunObjectFields<Context> = makeMakeRunObjectFields(newContext);
