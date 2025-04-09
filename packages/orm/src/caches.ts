import { ReactiveField, ReactiveRule } from "./config";
import { EntityMetadata, getBaseAndSelfMetas, getBaseSelfAndSubMetas } from "./EntityMetadata";

// We calculate these all the time, so cache them for good measure.
const reactiveFieldCache: WeakMap<EntityMetadata, ReactiveField[]> = new WeakMap();
const reactiveRuleCache: WeakMap<EntityMetadata, ReactiveRule[]> = new WeakMap();

export function getReactiveFields(meta: EntityMetadata): ReactiveField[] {
  let fields = reactiveFieldCache.get(meta);
  if (fields === undefined) {
    fields = getBaseAndSelfMetas(meta).flatMap((m) => m.config.__data.reactiveDerivedValues);
    reactiveFieldCache.set(meta, fields);
  }
  return fields;
}

export function getReactiveRules(meta: EntityMetadata): ReactiveRule[] {
  let rules = reactiveRuleCache.get(meta);
  if (rules === undefined) {
    // We use "AndSub" because `getReactiveRules` is called with `todo.metadata`, which is always
    // the root type, but ofc we don't want to skip subtype rules.
    //
    // I had considered filtering this list with `rr.fields.length > 0`, but even rules with 100%
    // immutable fields (so all read-only, and so not "reactive") need to run on initial entity creation.
    rules = getBaseSelfAndSubMetas(meta).flatMap((m) => m.config.__data.reactiveRules);
    reactiveRuleCache.set(meta, rules);
  }
  return rules;
}
