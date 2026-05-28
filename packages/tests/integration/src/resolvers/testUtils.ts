import {
  MakeRunInputMutation,
  MakeRunObjectField,
  MakeRunObjectFields,
  MakeRunQuery,
  makeMakeRunInputMutation,
  makeMakeRunObjectField,
  makeMakeRunObjectFields,
  makeMakeRunQuery,
} from "joist-graphql-resolver-utils/tests";
import { Context, run } from "joist-test-utils";

export { run };

export const makeRunInputMutation: MakeRunInputMutation<Context> = makeMakeRunInputMutation(run);
export const makeRunObjectField: MakeRunObjectField<Context> = makeMakeRunObjectField(run);
export const makeRunObjectFields: MakeRunObjectFields<Context> = makeMakeRunObjectFields(run);
export const makeRunQuery: MakeRunQuery<Context> = makeMakeRunQuery(run);
