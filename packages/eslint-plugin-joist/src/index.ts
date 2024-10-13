import {joistEntityOrdering} from "./rules/joist-entity-ordering";
import {noNewEntity} from "./rules/no-entity-new";

export const rules = {
    'joist-entity-ordering': joistEntityOrdering,
    'no-new-entity': noNewEntity,
}