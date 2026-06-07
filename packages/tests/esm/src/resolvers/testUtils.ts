import {
  type MakeRunInputMutation,
  type MakeRunObjectField,
  type MakeRunObjectFields,
  type MakeRunQuery,
  makeMakeRunInputMutation,
  makeMakeRunObjectField,
  makeMakeRunObjectFields,
  makeMakeRunQuery,
} from "joist-graphql-resolver-utils/tests";
import { type Context, run } from "joist-test-utils";

export { run };

export const makeRunInputMutation: MakeRunInputMutation<Context> = makeMakeRunInputMutation(run);
export const makeRunObjectField: MakeRunObjectField<Context> = makeMakeRunObjectField(run);
export const makeRunObjectFields: MakeRunObjectFields<Context> = makeMakeRunObjectFields(run);
export const makeRunQuery: MakeRunQuery<Context> = makeMakeRunQuery(run);
