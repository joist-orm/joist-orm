import { ReactiveField, ReactiveRule } from "./config";
import { EntityMetadata, getBaseAndSelfMetas, getBaseSelfAndSubMetas } from "./EntityMetadata";

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
    rules = getBaseSelfAndSubMetas(meta).flatMap((m) => m.config.__data.reactiveRules);
    reactiveRuleCache.set(meta, rules);
  }
  return rules;
}
