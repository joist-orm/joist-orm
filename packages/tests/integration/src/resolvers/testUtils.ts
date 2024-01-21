import {
  MakeRunInputMutation,
  MakeRunObjectField,
  MakeRunObjectFields,
  makeMakeRunInputMutation,
  makeMakeRunObjectField,
  makeMakeRunObjectFields,
} from "joist-graphql-resolver-utils/tests";
import { Context, run } from "joist-test-utils";

export { run };

export const makeRunInputMutation: MakeRunInputMutation<Context> = makeMakeRunInputMutation(run);
export const makeRunObjectField: MakeRunObjectField<Context> = makeMakeRunObjectField(run);
export const makeRunObjectFields: MakeRunObjectFields<Context> = makeMakeRunObjectFields(run);
